// Lightweight enum aliases used by the Express services.
// After `prisma generate`, these can be replaced with imports from `@prisma/client`.

export type Role = 'super_admin' | 'admin' | 'company' | 'worker';
export type WorkerStatus =
  | 'draft'
  | 'pending_otp'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'inactive';
export type WorkerClass = 'A' | 'B' | 'C';
export type CompanyStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'inactive';
export type OtpPurpose =
  | 'worker_registration'
  | 'worker_login'
  | 'worker_password_reset'
  | 'worker_phone_change'
  | 'company_registration'
  | 'company_login'
  | 'company_password_reset'
  | 'admin_login';
export type OrderStatus =
  | 'draft'
  | 'active'
  | 'published'
  | 'partially_assigned'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type AssignmentStatus = 'assigned' | 'accepted' | 'rejected' | 'completed' | 'cancelled';
export type NotificationType =
  | 'worker_approved'
  | 'worker_rejected'
  | 'company_approved'
  | 'company_rejected'
  | 'order_created'
  | 'job_assigned'
  | 'system';
export type NotificationChannel = 'in_app' | 'sms' | 'email' | 'push';
export type DevicePlatform = 'android' | 'ios' | 'web' | 'unknown';
export type AuditAction =
  | 'worker_approved'
  | 'worker_rejected'
  | 'company_approved'
  | 'company_rejected'
  | 'order_created'
  | 'order_cancelled'
  | 'assignment_created'
  | 'attendance_checked_in'
  | 'attendance_checked_out'
  | 'rating_created'
  | 'worker_class_updated'
  | 'worker_foc_training_added'
  | 'worker_foc_training_removed'
  | 'status_changed'
  | 'login_failed'
  | 'otp_blocked';
