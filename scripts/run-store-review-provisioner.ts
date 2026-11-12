import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import {
  assertStoreReviewProvisionAllowed,
  provisionStoreReviewAccounts,
} from './provision-store-review';
import { runReviewAccountReadiness } from './review-account-readiness';
import { resolveStoreReviewAccountConfig } from '../src/lib/store-review-accounts';

type ProvisionerCommand = 'plan' | 'apply' | 'check';

function parseCommand(args: string[]): ProvisionerCommand {
  if (args.length === 0) return 'plan';
  if (args.length !== 1 || !['plan', 'apply', 'check'].includes(args[0])) {
    throw new Error('STORE_REVIEW_PROVISIONER_COMMAND_INVALID');
  }
  return args[0] as ProvisionerCommand;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z][A-Z0-9_:-]{2,160}$/.test(error.message)) {
    return error.message;
  }
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

async function runProvision(command: 'plan' | 'apply'): Promise<void> {
  const options = {
    apply: command === 'apply',
    adoptExisting: false,
    rotatePasswords: false,
  };

  // Fail closed before parsing credentials or opening a database connection.
  // The immutable release image intentionally exposes no adoption or password
  // rotation switches; those require separately reviewed source tooling.
  assertStoreReviewProvisionAllowed(options);
  const config = resolveStoreReviewAccountConfig();
  const prisma = new PrismaClient();
  try {
    const plan = await provisionStoreReviewAccounts(prisma, config, options);
    console.log('Store review provisioner completed.', {
      command,
      mode: plan.mode,
      account_count: plan.accountCount,
      create_count: plan.createCount,
      existing_review_count: plan.existingReviewCount,
      adoption_required_count: plan.adoptionRequiredCount,
      password_rotation_required_count: plan.passwordRotationRequiredCount,
      private_document_setup_required: plan.privateDocumentSetupRequired,
      profile_photo_setup_required: plan.profilePhotoSetupRequired,
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));
  if (command === 'check') {
    await runReviewAccountReadiness();
    return;
  }
  await runProvision(command);
}

void main().catch((error: unknown) => {
  console.error('Store review provisioner failed.', { error_code: safeErrorCode(error) });
  process.exitCode = 1;
});
