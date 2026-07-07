export type Role = 'worker' | 'company' | 'super_admin' | 'admin';
export type AdminPermission =
  | 'view_dashboard'
  | 'view_workers'
  | 'manage_workers'
  | 'view_companies'
  | 'manage_companies'
  | 'view_orders'
  | 'view_assignments'
  | 'manage_assignments'
  | 'view_attendance'
  | 'view_reports'
  | 'manage_kiosks'
  | 'view_notifications'
  | 'manage_admins';

export type WorkerStatus =
  | 'draft'
  | 'pending_otp'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'inactive';

export type CompanyStatus = 'pending_approval' | 'approved' | 'rejected' | 'suspended' | 'inactive';
export type OrderStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type AssignmentStatus = 'assigned' | 'accepted' | 'rejected' | 'completed' | 'cancelled';
export type WorkerClass = 'A' | 'B' | 'C';
export type TaxonomyStatus = 'active' | 'inactive';

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
  timestamp?: string;
}

export interface ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface AuthUser {
  id: string;
  phone: string;
  email?: string | null;
  role: Role;
  name: string;
  worker?: { id: string; status: WorkerStatus } | null;
  company?: { id: string; status: CompanyStatus } | null;
  admin?: { id: string } | null;
  permissions?: AdminPermission[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

export interface ManagedAdmin {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'admin';
  is_active: boolean;
  permissions: AdminPermission[];
  created_at: string;
  updated_at: string;
}

export interface TaxonomyDepartment {
  id: string;
  slug: string;
  name_az: string;
  name_en?: string | null;
  status: TaxonomyStatus;
  subdepartments: TaxonomySubdepartment[];
}

export interface TaxonomySubdepartment {
  id: string;
  slug: string;
  department_id: string;
  name_az: string;
  name_en?: string | null;
  status: TaxonomyStatus;
  positions: TaxonomyPosition[];
}

export interface TaxonomyPosition {
  id: string;
  slug: string;
  subdepartment_id: string;
  name_az: string;
  name_en?: string | null;
  status: TaxonomyStatus;
}

export interface TaxonomyPositionSummary extends TaxonomyPosition {
  department_id: string;
  department: Omit<TaxonomyDepartment, 'subdepartments'>;
  subdepartment: Omit<TaxonomySubdepartment, 'positions'>;
}

export interface WorkerProfile {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email?: string | null;
  position?: string | null;
  position_ids?: string[];
  positions?: TaxonomyPositionSummary[];
  profile_photo_url?: string | null;
  skills: unknown;
  languages?: unknown;
  documents?: unknown;
  work_history_summary?: string | null;
  status: WorkerStatus;
  reject_reason?: string | null;
  availability: boolean;
  worker_class?: WorkerClass | null;
  is_foc_training: boolean;
  foc_training_note?: string | null;
  foc_training_updated_at?: string | null;
  foc_training_updated_by_id?: string | null;
  rating_avg: number;
  rating_count: number;
  rating_summary?: { average: number; count: number };
  created_at: string;
  updated_at?: string;
  otp_status?: unknown;
  approval?: unknown;
}

export interface Rating {
  id: string;
  assignment_id?: string | null;
  order_id: string;
  worker_id: string;
  rater_id: string;
  score: number;
  feedback?: string | null;
  comment?: string | null;
  created_at: string;
  order?: {
    id: string;
    title: string;
    category?: string;
    start_datetime?: string;
    end_datetime?: string;
    location?: string;
    company?: { id: string; name: string };
  };
}

export interface RatingSummary {
  rating_avg: number;
  rating_count: number;
  avg: number;
  total: number;
  data: Rating[];
  ratings?: Rating[];
}

export interface CompanyProfile {
  id: string;
  user_id: string;
  name: string;
  contact_name?: string;
  phone: string;
  email?: string | null;
  status: CompanyStatus;
  docs_url?: string | null;
  documents?: unknown;
  reject_reason?: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  company_id: string;
  company?: {
    id: string;
    name: string;
    status: CompanyStatus;
    contact_name?: string;
    phone?: string;
  };
  title: string;
  description: string;
  category: string;
  category_items?: OrderCategoryItem[];
  required_count: number;
  required_skills: string[];
  start_datetime: string;
  end_datetime: string;
  location: string;
  pay_rate?: number | string | null;
  notes?: string | null;
  status: OrderStatus;
  assignment_count: number;
  rating_count?: number;
  assignments?: Array<{
    id: string;
    worker_id: string;
    order_category_item_id?: string | null;
    assigned_category?: string | null;
    category?: string | null;
    status: AssignmentStatus;
    assigned_at: string;
    updated_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface OrderCategoryItem {
  id: string | null;
  category: string;
  department_id?: string | null;
  subdepartment_id?: string | null;
  position_id?: string | null;
  department?: Omit<TaxonomyDepartment, 'subdepartments'> | null;
  subdepartment?: Omit<TaxonomySubdepartment, 'positions'> | null;
  position?: TaxonomyPositionSummary | TaxonomyPosition | null;
  required_count: number;
  assigned_count?: number;
  remaining_count?: number;
  notes?: string | null;
}

export interface Assignment {
  id: string;
  order_id: string;
  worker_id: string;
  status: AssignmentStatus;
  order_category_item_id?: string | null;
  position_id?: string | null;
  category?: string | null;
  category_item?: OrderCategoryItem | null;
  assigned_at: string;
  updated_at: string;
  order: {
    id: string;
    title: string;
    category: string;
    category_items?: OrderCategoryItem[];
    status: OrderStatus;
    required_count: number;
    start_datetime: string;
    end_datetime: string;
    location: string;
    company: {
      id: string;
      name: string;
      status: CompanyStatus;
      contact_name?: string;
      phone?: string;
    };
  };
  worker: {
    id: string;
    name: string;
    phone: string;
    status: WorkerStatus;
    availability: boolean;
    position?: string;
    position_ids?: string[];
    positions?: TaxonomyPositionSummary[];
  };
}

export interface AdminReportSummary {
  filters?: {
    foc_training?: 'foc' | 'non_foc' | null;
    [key: string]: unknown;
  };
  dashboard: {
    today_active_orders: number;
    pending_orders: number;
    active_assignments: number;
    checked_in_workers_today: number;
    rejected_assignments: number;
    pending_worker_approvals: number;
    pending_company_approvals: number;
  };
  reports: {
    worker_work_counts: Array<{ worker_id: string; worker_name: string; completed_count: number }>;
    attendance: { total_count: number; completed_count: number; open_count: number };
    company_usage: Array<{ company_id: string; company_name: string; order_count: number }>;
    rating_stats: { average: number; count: number };
    assignment_stats: Array<{ status: AssignmentStatus; count: number }>;
    position_demand: Array<{
      position_id: string | null;
      position_name: string;
      department_id: string | null;
      department_name: string | null;
      subdepartment_id: string | null;
      subdepartment_name: string | null;
      required_count: number;
      order_item_count: number;
    }>;
    department_demand: Array<{
      department_id: string | null;
      department_name: string;
      required_count: number;
      order_item_count: number;
    }>;
    company_position_usage: Array<{
      company_id: string;
      company_name: string;
      position_id: string | null;
      position_name: string;
      required_count: number;
      order_item_count: number;
    }>;
  };
}

export interface AttendanceLog {
  id: string;
  assignment_id: string;
  checkin_time?: string | null;
  checkout_time?: string | null;
  duration_minutes?: number | null;
  checkin_location?: unknown;
  checkout_location?: unknown;
  checkin_notes?: string | null;
  checkout_notes?: string | null;
  created_at: string;
  updated_at: string;
  assignment: {
    id: string;
    status: AssignmentStatus;
    worker: { id: string; name: string; phone: string };
    order: {
      id: string;
      title: string;
      status: OrderStatus;
      company: { id: string; name: string };
    };
  };
}

export interface QrTokenResponse {
  assignment_id: string;
  order_id: string;
  order_title?: string;
  company_id?: string;
  company_name?: string;
  token: string;
  expires_at: string;
  refresh_after_seconds?: number;
}

export interface KioskSessionResponse {
  id: string;
  assignment_id: string;
  order_id: string;
  order_title: string;
  company_id: string;
  company_name: string;
  location?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  category?: string | null;
  status: 'active' | 'inactive';
  kiosk_status: 'active' | 'inactive';
  expires_at?: string | null;
  revoked_at?: string | null;
  refresh_interval_seconds: number;
  kiosk_token?: string;
  kiosk_url?: string;
}

export interface VenueKioskActiveSession {
  id: string;
  order_id: string;
  order_title: string;
  company_id: string;
  status: 'active' | 'inactive' | 'revoked';
  activated_at: string;
  expires_at?: string | null;
  location?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
}

export interface VenueKioskResponse {
  id: string;
  kiosk_id: string;
  company_id: string;
  company_name: string;
  name: string;
  kiosk_name: string;
  location_label?: string | null;
  status: 'active' | 'disabled';
  kiosk_status: 'active' | 'disabled';
  revoked_at?: string | null;
  created_at: string;
  updated_at: string;
  refresh_interval_seconds: number;
  kiosk_url?: string;
  active_session?: VenueKioskActiveSession | null;
  order_id?: string | null;
  order_title?: string | null;
  location?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  metadata?: unknown;
  read_at?: string | null;
  created_at: string;
}
