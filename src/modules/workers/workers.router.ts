import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireApprovedAccount, requirePermission, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './workers.service';
import * as RatingsService from '../ratings/ratings.service';
import { WorkerRatingsParamsSchema } from '../ratings/ratings.schema';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const UpdateWorkerSchema = z.object({
  email: z.string().trim().email().max(254).nullable().optional(),
  position_ids: z.array(z.string().uuid()).min(1).max(20).optional(),
  skills: z.array(z.union([
    z.string().min(1),
    z.object({ name: z.string().min(1), level: z.number().int().min(1).max(5).optional() }),
  ])).optional(),
  languages: z.array(z.string().min(1)).optional(),
  documents: z.array(z.object({ type: z.string(), url: z.string().url() }).passthrough()).optional(),
  availability: z.boolean().optional(),
  work_history_summary: z.string().trim().max(2000).nullable().optional(),
  work_history: z.array(z.object({
    company_name: z.string().trim().min(1).max(160),
    position: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).optional(),
  })).max(20).optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  whatsapp_available: z.boolean().optional(),
});

const WorkerDocumentUploadSchema = z.object({
  type: z.enum(['health_certificate', 'criminal_record']),
});

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

router.get('/workers/me', requireAuth, requireRole('worker'), requireApprovedAccount, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getMyWorker(req.user!.sub)); } catch (e) { next(e); }
});

router.patch('/workers/me', requireAuth, requireRole('worker'), requireApprovedAccount, validate(UpdateWorkerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.updateMyWorker(req.user!.sub, req.body)); } catch (e) { next(e); }
});

router.post('/workers/me/profile-photo', requireAuth, requireRole('worker'), requireApprovedAccount, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(201).json(await Service.uploadMyProfilePhoto(req.user!.sub, req.file)); } catch (e) { next(e); }
});

router.post('/workers/me/documents', requireAuth, requireRole('worker'), requireApprovedAccount, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = WorkerDocumentUploadSchema.parse(req.body);
    res.status(201).json(await Service.uploadMyDocument(req.user!.sub, body.type, req.file));
  } catch (e) { next(e); }
});

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
