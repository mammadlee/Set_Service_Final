// Lightweight enum aliases used by the Express services.
// After `prisma generate`, these can be replaced with imports from `@prisma/client`.

export type Role = 'super_admin' | 'company' | 'worker';
export type WorkerStatus =
  | 'draft'
  | 'pending_otp'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'inactive';
export type CompanyStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'inactive';
export type OtpPurpose =
  | 'worker_registration'
  | 'worker_login'
  | 'company_registration'
  | 'company_login'
  | 'admin_login';
export type OrderStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type AssignmentStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed';
export type NotificationType =
  | 'worker_approved'
  | 'worker_rejected'
  | 'company_approved'
  | 'company_rejected'
  | 'job_assigned'
  | 'system';
export type NotificationChannel = 'in_app' | 'sms' | 'email' | 'push';
export type AuditAction =
  | 'worker_approved'
  | 'worker_rejected'
  | 'company_approved'
  | 'company_rejected'
  | 'status_changed'
  | 'login_failed'
  | 'otp_blocked';
