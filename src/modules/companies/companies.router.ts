import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireEnrollmentAuth } from '../../middleware/auth';
import { requireApprovedAccount, requirePermission, requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as Service from './companies.service';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, parts: 3, fieldSize: 1024 },
});
const CompanyDocumentTypeSchema = z.enum([
  'registration_certificate',
  'tax_certificate',
  'operating_license',
  'other',
]);
const CompanyDocumentUploadSchema = z.object({ type: CompanyDocumentTypeSchema }).strict();
const CompanyDocumentParamsSchema = z.object({
  id: z.string().uuid().optional(),
  type: CompanyDocumentTypeSchema,
}).strict();

export const CompanyUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
  })
  .strict();

export const CompanyRejectSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const CompanyListQuerySchema = z
  .object({
    page: z.coerce.number().finite().int().min(1).default(1),
    limit: z.coerce.number().finite().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(200).optional(),
    status: z
      .enum(['pending_approval', 'approved', 'rejected', 'suspended', 'inactive'])
      .optional(),
    sort: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

router.get('/companies/me', requireAuth, requireRole('company'), requireApprovedAccount, async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getMyCompany(req.user!.sub)); } catch (e) { next(e); }
});

router.patch('/companies/me', requireAuth, requireRole('company'), requireApprovedAccount, validate(CompanyUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.updateMyCompany(req.user!.sub, req.body)); } catch (e) { next(e); }
});

router.post('/companies/me/documents', requireEnrollmentAuth, requireRole('company'), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CompanyDocumentUploadSchema.parse(req.body);
    res.status(201).json(await Service.uploadMyCompanyDocument(req.user!.sub, body.type, req.file));
  } catch (e) { next(e); }
});

router.get('/companies/me/documents/:type/download', requireEnrollmentAuth, requireRole('company'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = CompanyDocumentParamsSchema.parse(req.params);
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Referrer-Policy', 'no-referrer');
    res.json(await Service.getMyCompanyDocumentDownload(req.user!, params.type));
  } catch (e) { next(e); }
});

router.get('/admin/companies', requireAuth, requirePermission('view_companies'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = CompanyListQuerySchema.parse(req.query);
    res.json(await Service.listCompanies(query));
  } catch (e) { next(e); }
});

router.get('/admin/companies/:id', requireAuth, requirePermission('view_companies'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.getCompanyById(req.params.id)); } catch (e) { next(e); }
});

router.get('/admin/companies/:id/documents/:type/download', requireAuth, requirePermission('view_companies'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = CompanyDocumentParamsSchema.parse(req.params);
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Referrer-Policy', 'no-referrer');
    res.json(await Service.getCompanyDocumentDownload(req.user!, params.id!, params.type));
  } catch (e) { next(e); }
});

router.patch('/admin/companies/:id/approve', requireAuth, requirePermission('manage_companies'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.approveCompany(req.params.id, req.user!)); } catch (e) { next(e); }
});

router.patch('/admin/companies/:id/reject', requireAuth, requirePermission('manage_companies'), validate(CompanyRejectSchema), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await Service.rejectCompany(req.params.id, req.body.reason, req.user!)); } catch (e) { next(e); }
});

export default router;
