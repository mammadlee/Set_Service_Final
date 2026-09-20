
import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requireRole } from '../../middleware/rbac';
import { Role } from '../../types/prisma';

const router = Router();

const CreateReportSchema = z.object({
  target_type: z.enum(['order', 'worker_profile', 'rating']),
  target_id: z.string().uuid(),
  reason: z.enum([
    'inappropriate_content',
    'harassment',
    'false_information',
    'spam',
    'privacy',
    'other',
  ]),
  details: z.string().trim().max(1000).optional(),
}).strict();

router.post(
  '/reports',
  requireAuth,
  requireRole('worker', 'company'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = CreateReportSchema.parse(req.body);
      await assertTargetVisible(req.user!.sub, req.user!.role as Role, input);
      const reportId = crypto.randomUUID();

      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['admin', 'super_admin'] },
          is_active: true,
          deleted_at: null,
        },
        select: { id: true },
      });

      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            actor_id: req.user!.sub,
            actor_role: req.user!.role as Role,
            action: 'status_changed',
            entity_type: 'ugc_report',
            entity_id: reportId,
            metadata: {
              event: 'ugc_report_created',
              status: 'open',
              target_type: input.target_type,
              target_id: input.target_id,
              reason: input.reason,
              details: input.details?.trim() || null,
            },
          },
        });

        for (const admin of admins) {
          await tx.notification.create({
            data: {
              recipient_id: admin.id,
              type: 'system',
              channel: 'in_app',
              title: 'Yeni məzmun şikayəti',
              body: 'SET Service-də yeni istifadəçi şikayəti daxil olub.',
              metadata: {
                report_id: reportId,
                target_type: input.target_type,
                target_id: input.target_id,
                reason: input.reason,
                reporter_role: req.user!.role,
              },
            },
          });
        }
      });

      res.status(201).json({ id: reportId, status: 'open' });
    } catch (error) {
      next(error);
    }
  },
);

async function assertTargetVisible(
  userId: string,
  role: Role,
  input: z.infer<typeof CreateReportSchema>,
) {
  if (role === 'worker' && input.target_type === 'order') {
    const assignment = await prisma.assignment.findFirst({
      where: {
        order_id: input.target_id,
        deleted_at: null,
        worker: { user_id: userId, deleted_at: null },
        order: { deleted_at: null },
      },
      select: { id: true },
    });
    if (assignment) return;
  }

  if (role === 'worker' && input.target_type === 'rating') {
    const worker = await prisma.worker.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (worker) {
      const rating = await prisma.rating.findFirst({
        where: {
          id: input.target_id,
          worker_id: worker.id,
          deleted_at: null,
        },
        select: { id: true },
      });
      if (rating) return;
    }
  }

  if (role === 'company' && input.target_type === 'worker_profile') {
    const company = await prisma.company.findFirst({
      where: { user_id: userId, deleted_at: null, status: 'approved' },
      select: { id: true },
    });
    if (company) {
      const assignment = await prisma.assignment.findFirst({
        where: {
          worker_id: input.target_id,
          deleted_at: null,
          worker: { deleted_at: null },
          order: {
            company_id: company.id,
            deleted_at: null,
          },
        },
        select: { id: true },
      });
      if (assignment) return;
    }
  }

  throw Errors.forbidden(
    'Bu məzmunu şikayət etmək üçün giriş icazəniz yoxdur.',
    'REPORT_TARGET_FORBIDDEN',
  );
}

export default router;
