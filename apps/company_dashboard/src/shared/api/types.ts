export type Role = 'worker' | 'company' | 'super_admin';
export type CompanyStatus = 'pending_approval' | 'approved' | 'rejected' | 'suspended' | 'inactive';
export type WorkerStatus = 'draft' | 'pending_otp' | 'pending_approval' | 'approved' | 'rejected' | 'suspended' | 'inactive';
export type OrderStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type AssignmentStatus = 'assigned' | 'accepted' | 'rejected' | 'completed' | 'cancelled';
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
  company?: { id: string; status: CompanyStatus } | null;
  worker?: { id: string; status: WorkerStatus } | null;
  created_at?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
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

export interface CreateOrderInput {
  title: string;
  description: string;
  category?: string;
  required_count?: number;
  category_items?: Array<{
    category?: string;
    department_id?: string;
    subdepartment_id?: string;
    position_id?: string;
    required_count: number;
    notes?: string;
  }>;
  start_datetime: string;
  end_datetime: string;
  location: string;
  pay_rate?: number | string;
  required_skills?: string[];
  notes?: string;
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
    phone?: string;
    status: WorkerStatus;
    availability: boolean;
    position?: string;
    position_ids?: string[];
    positions?: TaxonomyPositionSummary[];
  };
}

export interface CompanyWorkerProfile {
  id: string;
  name: string;
  position?: string | null;
  position_ids?: string[];
  positions?: TaxonomyPositionSummary[];
  profile_photo_url?: string | null;
  skills: unknown;
  languages?: unknown;
  documents?: unknown;
  work_history_summary?: string | null;
  rating_avg: number;
  rating_count: number;
  rating_summary?: { average: number; count: number };
}

export interface Rating {
  id: string;
  assignment_id?: string | null;
  order_id: string;
  worker_id: string;
  score: number;
  feedback?: string | null;
  comment?: string | null;
  created_at: string;
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
    worker: { id: string; name: string; phone?: string };
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
