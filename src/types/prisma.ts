// Prisma generate sandbox-da çalışmadığı üçün enum-ları manual export edirik.
// `npx prisma generate` işlətdikdən sonra bu fayl lazım olmayacaq —
// birbaşa '@prisma/client'-dən import edə bilərsiniz.

export type Role = 'super_admin' | 'company' | 'worker';
export type CompanyStatus = 'pending' | 'approved' | 'rejected';
export type OrderStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type AssignmentStatus = 'pending' | 'accepted' | 'rejected';
