import { prisma } from './prisma';
import { AuditAction, Role } from '../types/prisma';

export async function recordAudit(input: {
  actor_id?: string | null;
  actor_role: Role;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  metadata?: unknown;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor_id: input.actor_id ?? null,
      actor_role: input.actor_role,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      metadata: input.metadata ?? {},
    },
  });
}
