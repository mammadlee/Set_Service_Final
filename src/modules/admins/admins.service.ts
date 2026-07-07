import { Prisma } from '@prisma/client';
import { Errors } from '../../lib/errors';
import { hashPassword, normalizeEmail } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import { CreateAdminInput, UpdateAdminInput } from './admins.schema';
import { normalizePermissions } from './admins.permissions';

export async function listAdmins() {
  const admins = await prisma.admin.findMany({
    where: { user: { role: 'admin', deleted_at: null } },
    include: { user: true },
    orderBy: { created_at: 'desc' },
  });

  return { data: admins.map(toAdminResponse) };
}

export async function createAdmin(input: CreateAdminInput) {
  const email = normalizeEmail(input.email);
  try {
    const admin = await prisma.admin.create({
      data: {
        permissions: normalizePermissions(input.permissions),
        user: {
          create: {
            phone: internalAdminPhone(email),
            email,
            name: input.name.trim(),
            role: 'admin',
            password_hash: await hashPassword(input.password),
            password_set_at: new Date(),
            is_active: input.is_active,
          },
        },
      },
      include: { user: true },
    });

    return toAdminResponse(admin);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw Errors.conflict('Bu e-poçt ilə admin artıq mövcuddur.', 'ADMIN_EMAIL_EXISTS');
    }
    throw error;
  }
}

export async function updateAdmin(id: string, actorUserId: string, input: UpdateAdminInput) {
  const existing = await prisma.admin.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!existing || existing.user.role !== 'admin' || existing.user.deleted_at) {
    throw Errors.notFound('Admin tapılmadı.', 'ADMIN_NOT_FOUND');
  }

  if (existing.user_id === actorUserId && input.is_active === false) {
    throw Errors.badRequest('Öz admin hesabınızı deaktiv edə bilməzsiniz.', 'ADMIN_SELF_DEACTIVATE_DENIED');
  }

  const email = input.email ? normalizeEmail(input.email) : undefined;
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  const now = new Date();
  try {
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const admin = await tx.admin.update({
        where: { id },
        data: {
          ...(input.permissions ? { permissions: normalizePermissions(input.permissions) } : {}),
          user: {
            update: {
              ...(input.name ? { name: input.name.trim() } : {}),
              ...(email ? { email } : {}),
              ...(email ? { phone: internalAdminPhone(email) } : {}),
              ...(passwordHash ? { password_hash: passwordHash, password_set_at: now } : {}),
              ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
            },
          },
        },
        include: { user: true },
      });

      if (passwordHash) {
        await revokeAdminSessions(tx, existing.user_id, now);
      }

      return admin;
    });

    return toAdminResponse(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw Errors.conflict('Bu e-poçt ilə admin artıq mövcuddur.', 'ADMIN_EMAIL_EXISTS');
    }
    throw error;
  }
}

export async function deactivateAdmin(id: string, actorUserId: string) {
  return updateAdmin(id, actorUserId, { is_active: false });
}

function toAdminResponse(admin: Prisma.AdminGetPayload<{ include: { user: true } }>) {
  return {
    id: admin.id,
    user_id: admin.user_id,
    name: admin.user.name,
    email: admin.user.email,
    role: admin.user.role,
    is_active: admin.user.is_active,
    permissions: normalizePermissions(admin.permissions),
    created_at: admin.created_at,
    updated_at: admin.updated_at,
  };
}

function internalAdminPhone(email: string): string {
  return `admin:${email}`;
}

async function revokeAdminSessions(tx: Prisma.TransactionClient, userId: string, now: Date): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: now },
  });
  await tx.deviceToken.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: now, deleted_at: now },
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
