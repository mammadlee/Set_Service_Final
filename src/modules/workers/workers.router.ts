import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Errors } from '../../lib/errors';
import { resolveLocalPrivateDownload } from '../../lib/uploads';
import { requireAuth, requireEnrollmentAuth } from '../../middleware/auth';
import {
  requireApprovedAccount,
  requirePermission,
  requireRole,
  requireRoleOrPermission,
} from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './workers.service';
import * as RatingsService from '../ratings/ratings.service';
import { WorkerRatingsParamsSchema } from '../ratings/ratings.schema';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 3,
    fieldSize: 1024,
  },
});

export const UpdateWorkerSchema = z.object({
  email: z.string().trim().email().max(254).nullable().optional(),
  position_ids: z.array(z.string().uuid()).min(1).max(20).optional(),
  skills: z.array(z.union([
    z.string().min(1),
    z.object({ name: z.string().min(1), level: z.number().int().min(1).max(5).optional() }).strict(),
  ])).optional(),
  languages: z.array(z.string().min(1)).optional(),
  availability: z.boolean().optional(),
  work_history_summary: z.string().trim().max(2000).nullable().optional(),
  work_history: z.array(z.object({
    company_name: z.string().trim().min(1).max(160),
    position: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).optional(),
  }).strict()).max(20).optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  whatsapp_available: z.boolean().optional(),
}).strict();

const WorkerDocumentUploadSchema = z.object({
  type: z.enum(['health_certificate', 'criminal_record']),
}).strict();

const WorkerDocumentDownloadParamsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['health_certificate', 'criminal_record']),
}).strict();

const WorkerDocumentDeleteParamsSchema = z.object({
  type: z.enum(['health_certificate', 'criminal_record']),
}).strict();

export const WorkerAccountDeletionRequestSchema = z.object({
  confirm: z.literal(true),
}).strict();

const RejectWorkerSchema = z.object({
  reason: z.string().min(3).max(1000),
});

const UpdateWorkerClassSchema = z.object({
  worker_class: z.enum(['A', 'B', 'C']).nullable(),
});

const UpdateFocTrainingSchema = z.object({
  worker_ids: z.array(z.string().uuid()).min(1).max(200),
  is_foc_training: z.boolean(),
  note: z.string().trim().max(1000).nullable().optional(),
});

router.get('/private-worker-documents/:token', (req: Request, res: Response, next: NextFunction) => {
  try {
    const download = resolveLocalPrivateDownload(req.params.token);
    if (!download) {
      throw Errors.notFound('Private document not found.', 'PRIVATE_DOCUMENT_NOT_FOUND');
    }

    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.download(download.filePath, download.downloadName, (error) => {
      if (error && !res.headersSent) {
        next(Errors.notFound('Private document not found.', 'PRIVATE_DOCUMENT_NOT_FOUND'));
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/workers/me', requireAuth, requireRole('worker'), requireApprovedAccount, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getMyWorker(req.user!.sub)); } catch (e) { next(e); }
});

router.patch('/workers/me', requireAuth, requireRole('worker'), requireApprovedAccount, validate(UpdateWorkerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.updateMyWorker(req.user!.sub, req.body)); } catch (e) { next(e); }
});

router.post('/workers/me/profile-photo', requireAuth, requireRole('worker'), requireApprovedAccount, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(201).json(await Service.uploadMyProfilePhoto(req.user!.sub, req.file)); } catch (e) { next(e); }
});

router.post('/workers/me/documents', requireEnrollmentAuth, requireRole('worker'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = WorkerDocumentUploadSchema.parse(req.body);
    res.status(201).json(await Service.uploadMyDocument(req.user!.sub, body.type, req.file));
  } catch (e) { next(e); }
});

router.delete('/workers/me/documents/:type', requireEnrollmentAuth, requireRole('worker'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = WorkerDocumentDeleteParamsSchema.parse(req.params);
    res.json(await Service.deleteMyDocument(req.user!.sub, params.type));
  } catch (e) { next(e); }
});

router.post('/workers/me/account-deletion-request', requireAuth, requireRole('worker'), validate(WorkerAccountDeletionRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(202).json(await Service.requestMyAccountDeletion(req.user!.sub));
  } catch (e) { next(e); }
});

router.get(
  '/workers/:id/documents/:type/download',
  requireAuth,
  requireRoleOrPermission('view_workers', 'worker', 'company'),
  requireApprovedAccount,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = WorkerDocumentDownloadParamsSchema.parse(req.params);
      res.set('Cache-Control', 'private, no-store, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Referrer-Policy', 'no-referrer');
      res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.json(await Service.getWorkerDocumentDownload(req.user!, params.id, params.type));
    } catch (error) {
      next(error);
    }
  }
);

router.get('/workers/:id/company-profile', requireAuth, requireRole('company'), requireApprovedAccount, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getCompanyVisibleWorkerProfile(req.user!.sub, req.params.id)); } catch (e) { next(e); }
});

router.get('/admin/workers', requireAuth, requirePermission('view_workers'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await Service.listWorkers({
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      search: req.query.search as string | undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      worker_class: typeof req.query.worker_class === 'string' ? req.query.worker_class : undefined,
      position_id: typeof req.query.position_id === 'string' ? req.query.position_id : undefined,
      foc_training: typeof req.query.foc_training === 'string' ? req.query.foc_training : undefined,
      sort: req.query.sort === 'asc' ? 'asc' : 'desc',
      available: req.query.available === 'true' ? true : req.query.available === 'false' ? false : undefined,
    }));
  } catch (e) { next(e); }
});

router.get('/admin/workers/:id', requireAuth, requirePermission('view_workers'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getWorkerById(req.params.id)); } catch (e) { next(e); }
});

router.patch('/admin/workers/:id/approve', requireAuth, requirePermission('manage_workers'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.approveWorker(req.params.id, req.user!)); } catch (e) { next(e); }
});

router.patch('/admin/workers/:id/reject', requireAuth, requirePermission('manage_workers'), validate(RejectWorkerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.rejectWorker(req.params.id, req.body.reason, req.user!)); } catch (e) { next(e); }
});

router.patch('/admin/workers/:id/class', requireAuth, requirePermission('manage_workers'), validate(UpdateWorkerClassSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.updateWorkerClass(req.params.id, req.body.worker_class, req.user!)); } catch (e) { next(e); }
});

router.patch('/admin/workers/foc-training', requireAuth, requirePermission('manage_workers'), validate(UpdateFocTrainingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.updateWorkersFocTraining(req.body.worker_ids, req.body.is_foc_training, req.body.note, req.user!)); } catch (e) { next(e); }
});

router.get('/workers/:id/ratings', requireAuth, requirePermission('view_workers'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = WorkerRatingsParamsSchema.parse(req.params);
    res.json(await RatingsService.getWorkerRatings(id, req.user!.role));
  } catch (e) { next(e); }
});

export default router;
