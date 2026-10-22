import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { AddressInfo } from 'node:net';
import '../src/middleware/auth';
import { prisma } from '../src/lib/prisma';
import { createRateLimitMiddleware, MemoryRateLimitStore } from '../src/middleware/rate-limit';
import { errorHandler } from '../src/middleware/errorHandler';
import { publicAccountDeletionRouter } from '../src/modules/legal/legal.router';
import {
  getExternalDeletionRequest,
  listExternalDeletionRequests,
  reviewExternalDeletionRequest,
} from '../src/modules/legal/account-deletion.service';
import * as workerService from '../src/modules/workers/workers.service';

process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
process.env.OTP_PEPPER = 'regression-only-privacy-hmac-key-123456789';

const phone = '+994501234567';
const knownUserId = '20000000-0000-4000-8000-000000000001';
const reviewerId = '30000000-0000-4000-8000-000000000001';
type RequestRow = Record<string, any>;
const requests: RequestRow[] = [];
const notifications: RequestRow[] = [];
const auditEvents: RequestRow[] = [];
let accountDeleted = false;
let deletionCalls = 0;
let failDeletion = false;
let knownIsReviewAccount = false;
let knownUserIsActive = true;
let knownUserDeletedAt: Date | null = null;
let knownProfileDeletedAt: Date | null = null;
const adminLookupWheres: any[] = [];
const publicLookupWheres: any[] = [];

function mockPrisma() {
  const prismaAny = prisma as any;
  const originals = {
    userFindMany: prismaAny.user.findMany,
    userFindUnique: prismaAny.user.findUnique,
    transaction: prismaAny.$transaction,
    requestFindUnique: prismaAny.externalAccountDeletionRequest.findUnique,
    requestCount: prismaAny.externalAccountDeletionRequest.count,
    requestFindMany: prismaAny.externalAccountDeletionRequest.findMany,
  };
  prismaAny.user.findMany = async (query: any) => {
    publicLookupWheres.push(query.where);
    const candidate = query.where.phone ?? query.where.OR?.[0]?.email;
    if (candidate !== phone) return [];
    return [{
      id: knownUserId,
      role: 'worker',
      is_active: knownUserIsActive,
      is_review_account: knownIsReviewAccount,
      deleted_at: knownUserDeletedAt,
      worker: { deleted_at: knownProfileDeletedAt },
      company: null,
    }];
  };
  prismaAny.user.findUnique = async ({ where }: any) => where.id === knownUserId ? {
    deleted_at: accountDeleted ? new Date() : null,
    is_active: !accountDeleted,
    worker: { deleted_at: accountDeleted ? new Date() : null },
    company: null,
  } : null;
  const originalWorkerDeletion = workerService.requestMyAccountDeletion;
  (workerService as any).requestMyAccountDeletion = async (userId: string, actor: any) => {
    assert.equal(userId, knownUserId);
    assert.deepEqual(actor, { sub: reviewerId, role: 'super_admin' });
    deletionCalls += 1;
    if (failDeletion) throw new Error('simulated cleanup failure');
    accountDeleted = true;
    return { status: 'deleted' };
  };
  prismaAny.externalAccountDeletionRequest.findUnique = async ({ where }: any) => requests.find((item) => item.id === where.id) ?? null;
  prismaAny.externalAccountDeletionRequest.count = async ({ where }: any) => requests.filter((item) => !where.status || item.status === where.status).length;
  prismaAny.externalAccountDeletionRequest.findMany = async ({ where, skip, take }: any) => requests
    .filter((item) => !where.status || item.status === where.status)
    .slice(skip, skip + take);
  prismaAny.$transaction = async (operation: any) => {
    if (Array.isArray(operation)) return Promise.all(operation);
    return operation({
      externalAccountDeletionRequest: {
        create: async ({ data }: any) => {
          const row = { ...data, status: 'open', created_at: new Date(), updated_at: new Date() };
          requests.push(row);
          return row;
        },
        updateMany: async ({ where, data }: any) => {
          const row = requests.find((item) => item.id === where.id && item.status === where.status);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      },
      user: {
        findMany: async ({ where }: any) => {
          adminLookupWheres.push(where);
          return [{ id: reviewerId }];
        },
      },
      notification: { createMany: async ({ data }: any) => { notifications.push(...data); return { count: data.length }; } },
      auditLog: { create: async ({ data }: any) => { auditEvents.push(data); return { id: crypto.randomUUID() }; } },
    });
  };
  return () => {
    prismaAny.user.findMany = originals.userFindMany;
    prismaAny.user.findUnique = originals.userFindUnique;
    prismaAny.$transaction = originals.transaction;
    prismaAny.externalAccountDeletionRequest.findUnique = originals.requestFindUnique;
    prismaAny.externalAccountDeletionRequest.count = originals.requestCount;
    prismaAny.externalAccountDeletionRequest.findMany = originals.requestFindMany;
    (workerService as any).requestMyAccountDeletion = originalWorkerDeletion;
  };
}

async function main() {
  const restore = mockPrisma();
  const app = express();
  app.use(express.json());
  app.use('/v1/public/account-deletion-requests', createRateLimitMiddleware({
    scope: 'public_deletion_regression',
    windowMs: 60_000,
    max: 7,
    dimensions: ['ip'],
    store: new MemoryRateLimitStore(),
  }));
  app.use('/v1/public', publicAccountDeletionRouter);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const send = (identifier: string, role: 'worker' | 'company' = 'worker') => fetch(`http://127.0.0.1:${port}/v1/public/account-deletion-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role, identifier, note: `Please delete ${identifier}` }),
    });
    assert.equal((await send('not-an-email@')).status, 400, 'malformed contact must fail validation');
    const known = await send(phone);
    const knownBody = await known.json();
    knownIsReviewAccount = true;
    const reviewAccount = await send(phone);
    const reviewAccountBody = await reviewAccount.json();
    assert.equal(requests.length, 1);
    assert.equal(notifications.length, 1);

    knownUserIsActive = false;
    knownUserDeletedAt = new Date();
    const inactiveReviewAccount = await send(phone);
    const inactiveReviewAccountBody = await inactiveReviewAccount.json();
    assert.equal(requests.length, 1, 'inactive reviewer users must not create deletion workflows');
    assert.equal(notifications.length, 1, 'inactive reviewer users must not notify operators');

    knownUserIsActive = true;
    knownUserDeletedAt = null;
    knownProfileDeletedAt = new Date();
    const deletedProfileReviewAccount = await send(phone);
    const deletedProfileReviewAccountBody = await deletedProfileReviewAccount.json();
    assert.equal(requests.length, 1, 'deleted reviewer profiles must not create deletion workflows');
    assert.equal(notifications.length, 1, 'deleted reviewer profiles must not notify operators');

    const wrongRoleReviewAccount = await send(phone, 'company');
    const wrongRoleReviewAccountBody = await wrongRoleReviewAccount.json();
    assert.equal(requests.length, 1, 'reviewer identifiers must be suppressed regardless of selected role');
    assert.equal(notifications.length, 1, 'wrong-role reviewer requests must not notify operators');

    knownIsReviewAccount = false;
    knownProfileDeletedAt = null;
    const unknown = await send('+994501234568');
    const unknownBody = await unknown.json();
    assert.equal(known.status, 202);
    assert.equal(reviewAccount.status, 202);
    assert.equal(inactiveReviewAccount.status, 202);
    assert.equal(deletedProfileReviewAccount.status, 202);
    assert.equal(wrongRoleReviewAccount.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(knownBody, unknownBody, 'public response must not enumerate accounts');
    assert.deepEqual(
      reviewAccountBody,
      unknownBody,
      'review-account suppression must not be observable from the public response',
    );
    assert.deepEqual(inactiveReviewAccountBody, unknownBody);
    assert.deepEqual(deletedProfileReviewAccountBody, unknownBody);
    assert.deepEqual(wrongRoleReviewAccountBody, unknownBody);
    assert.equal((await send('+994501234569')).status, 429, 'request threshold must be rate limited');

    assert.equal(requests.length, 2, 'review accounts must be suppressed while unknown accounts remain reviewable');
    assert.equal(requests[0].account_user_id, knownUserId);
    assert.equal(requests[1].account_user_id, null);
    assert.equal(requests[0].identifier_hmac.length, 64);
    assert.equal(requests[0].identifier_hmac, crypto.createHmac('sha256', process.env.OTP_PEPPER!).update(`external_account_deletion:v1:worker:phone:${phone}`).digest('hex'));
    assert.equal(JSON.stringify({ requests, notifications, auditEvents }).includes(phone), false);
    assert.equal(requests[0].note, 'Please delete [redacted]');
    assert.equal(notifications.length, 2, 'review-account requests must not notify the Super Admin');
    assert.equal(notifications[0].recipient_id, reviewerId);
    assert.equal(adminLookupWheres.length, 2);
    assert.equal(adminLookupWheres.every((where) => where.is_review_account === false), true);
    assert.equal(publicLookupWheres.length, 6);
    assert.equal(
      publicLookupWheres.every((where) => !('is_active' in where) && !('deleted_at' in where) && !('role' in where)),
      true,
      'reviewer detection must not depend on user lifecycle state or submitted role',
    );

    const open = await listExternalDeletionRequests({ page: 1, limit: 20, status: 'open' });
    assert.equal(open.meta.total, 2);
    assert.equal((await getExternalDeletionRequest(requests[0].id)).status, 'open');
    await assert.rejects(
      reviewExternalDeletionRequest(requests[0].id, reviewerId, { status: 'resolved', resolution_note: 'handled' }),
      (error: any) => error?.code === 'DELETION_VERIFICATION_REQUIRED',
    );
    await reviewExternalDeletionRequest(requests[0].id, reviewerId, { status: 'reviewing' });
    await assert.rejects(
      reviewExternalDeletionRequest(requests[0].id, reviewerId, { status: 'resolved', resolution_note: 'done' }),
      (error: any) => error?.code === 'DELETION_VERIFICATION_REQUIRED',
    );
    failDeletion = true;
    await assert.rejects(
      reviewExternalDeletionRequest(requests[0].id, reviewerId, {
        status: 'resolved',
        resolution_note: 'Ownership verified and request completed',
        ownership_verification: 'verified_phone_support',
      }),
      /simulated cleanup failure/,
    );
    assert.equal(requests[0].status, 'reviewing', 'failed deletion must not close the request');
    failDeletion = false;
    const resolved = await reviewExternalDeletionRequest(requests[0].id, reviewerId, {
      status: 'resolved',
      resolution_note: 'Ownership verified and request completed',
      ownership_verification: 'verified_phone_support',
    });
    assert.equal(resolved.status, 'resolved');
    assert.equal(deletionCalls, 2, 'resolution retries deletion and closes only after success');
    assert.equal(accountDeleted, true);
    await assert.rejects(
      reviewExternalDeletionRequest(requests[1].id, reviewerId, { status: 'resolved', resolution_note: 'Unknown account', ownership_verification: 'verified_phone_support' }),
      (error: any) => error?.code === 'DELETION_VERIFICATION_REQUIRED',
    );
    assert.equal(auditEvents.length, 2);
    assert.equal(JSON.stringify(auditEvents).includes(phone), false);
    console.log('external-deletion-regression: OK');
  } finally {
    restore();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
