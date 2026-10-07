import 'dotenv/config';

/* eslint-disable @typescript-eslint/no-var-requires */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { TAXONOMY_SEED } = require('../src/modules/taxonomy/taxonomy.seed');
const {
  assertSeedAllowed,
  resolveSeedPassword,
  safeSeedErrorName,
} = require('../src/lib/seed-safety');
const {
  APPLE_REVIEW_ADMIN_EMAIL,
  APPLE_REVIEW_ADMIN_PERMISSIONS,
  APPLE_REVIEW_ADMIN_PHONE,
  APPLE_REVIEW_COMPANY_EMAIL,
  APPLE_REVIEW_COMPANY_PHONE,
  APPLE_REVIEW_WORKER_PHONE,
  assertAppleReviewPasswordsUnique,
  resolveAppleReviewPasswordsForSeed,
} = require('../src/lib/apple-review-accounts');

assertSeedAllowed();

const prisma = new PrismaClient();

const seedIdentifier = (envName: string, fallback: string) =>
  process.env[envName]?.trim() || fallback;

const ADMIN_EMAIL = seedIdentifier('SEED_ADMIN_EMAIL', 'admin@setservice.az').toLowerCase();
const ADMIN_PASSWORD = resolveSeedPassword('SEED_ADMIN_PASSWORD');
const COMPANY_PASSWORD = resolveSeedPassword('SEED_COMPANY_PASSWORD');
const WORKER_PASSWORD = resolveSeedPassword('SEED_WORKER_PASSWORD');
const REPORTS_ADMIN_EMAIL = seedIdentifier(
  'SEED_REPORTS_ADMIN_EMAIL',
  'reports@setservice.az',
).toLowerCase();
const RESTRICTED_ADMIN_PASSWORD = resolveSeedPassword('SEED_RESTRICTED_ADMIN_PASSWORD');
const APPLE_REVIEW_PASSWORDS = resolveAppleReviewPasswordsForSeed();
assertAppleReviewPasswordsUnique(APPLE_REVIEW_PASSWORDS, {
  SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
  SEED_COMPANY_PASSWORD: COMPANY_PASSWORD,
  SEED_WORKER_PASSWORD: WORKER_PASSWORD,
  SEED_RESTRICTED_ADMIN_PASSWORD: RESTRICTED_ADMIN_PASSWORD,
});

const REPORTS_ADMIN_PERMISSIONS = [
  'view_dashboard',
  'view_reports',
  'view_workers',
  'view_companies',
  'view_orders',
];

async function main() {
  console.log('Seed starting.');
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const restrictedAdminPasswordHash = await bcrypt.hash(RESTRICTED_ADMIN_PASSWORD, 12);
  const workerPasswordHash = await bcrypt.hash(WORKER_PASSWORD, 12);
  const appleReviewWorkerPasswordHash = await bcrypt.hash(APPLE_REVIEW_PASSWORDS.worker, 12);
  const appleReviewCompanyPasswordHash = await bcrypt.hash(APPLE_REVIEW_PASSWORDS.company, 12);
  const appleReviewAdminPasswordHash = await bcrypt.hash(APPLE_REVIEW_PASSWORDS.admin, 12);

  const admin = await prisma.user.upsert({
    where: { phone: '+994700000001' },
    update: {
      email: ADMIN_EMAIL,
      role: 'super_admin',
      name: 'Super Admin',
      is_active: true,
    },
    create: {
      phone: '+994700000001',
      email: ADMIN_EMAIL,
      password_hash: adminPasswordHash,
      password_set_at: new Date(),
      role: 'super_admin',
      name: 'Super Admin',
    },
  });
  await prisma.admin.upsert({
    where: { user_id: admin.id },
    update: { permissions: ['*'] },
    create: { user_id: admin.id, permissions: ['*'] },
  });
  console.log('Super admin seed reconciled.');

  await seedRestrictedAdmin({
    phone: APPLE_REVIEW_ADMIN_PHONE,
    email: APPLE_REVIEW_ADMIN_EMAIL,
    name: 'Operations Admin',
    permissions: APPLE_REVIEW_ADMIN_PERMISSIONS,
    password_hash: appleReviewAdminPasswordHash,
    reconcile_password: true,
  });

  await seedRestrictedAdmin({
    phone: '+994700000102',
    email: REPORTS_ADMIN_EMAIL,
    name: 'Reports Admin',
    permissions: REPORTS_ADMIN_PERMISSIONS,
    password_hash: restrictedAdminPasswordHash,
  });

  await seedTaxonomy();

  const companyUser = await prisma.user.upsert({
    where: { phone: APPLE_REVIEW_COMPANY_PHONE },
    update: {
      email: APPLE_REVIEW_COMPANY_EMAIL,
      role: 'company',
      name: 'Hilton Baku Əməliyyat Meneceri',
      is_active: true,
      deleted_at: null,
      password_hash: appleReviewCompanyPasswordHash,
      password_set_at: new Date(),
    },
    create: {
      phone: APPLE_REVIEW_COMPANY_PHONE,
      email: APPLE_REVIEW_COMPANY_EMAIL,
      password_hash: appleReviewCompanyPasswordHash,
      password_set_at: new Date(),
      role: 'company',
      name: 'Hilton Baku Əməliyyat Meneceri',
    },
  });

  const company = await prisma.company.upsert({
    where: { user_id: companyUser.id },
    update: {
      name: 'Hilton Baku',
      status: 'approved',
      approved_at: new Date(),
      deleted_at: null,
    },
    create: {
      user_id: companyUser.id,
      name: 'Hilton Baku',
      status: 'approved',
      approved_at: new Date(),
    },
  });
  console.log('Company seed reconciled.');

  await seedWorker({
    phone: APPLE_REVIEW_WORKER_PHONE,
    name: 'Elvin Məmmədov',
    position: 'Ofisiant',
    status: 'approved',
    skills: [{ name: 'Servis', level: 4 }, { name: 'Qonaq qarşılama', level: 3 }],
    languages: ['Azərbaycan', 'English'],
    password_hash: appleReviewWorkerPasswordHash,
    reconcile_password: true,
    position_slug: 'waiter-waitress',
  });

  await seedWorker({
    phone: '+994700000004',
    name: 'Murad Əliyev',
    position: 'Barmen',
    status: 'pending_approval',
    skills: [{ name: 'Barista', level: 5 }],
    languages: ['Azərbaycan', 'Türkçe'],
    password_hash: workerPasswordHash,
    position_slug: 'bartender',
  });

  await seedWorker({
    phone: '+994700000005',
    name: 'Nihat Həsənov',
    position: 'Runner',
    status: 'rejected',
    skills: [{ name: 'Catering', level: 3 }],
    languages: ['Azərbaycan', 'Русский'],
    password_hash: workerPasswordHash,
    reject_reason: 'Sənədlər tam deyil.',
    position_slug: 'runner',
  });

  const waiterPosition = await prisma.position.findUnique({
    where: { slug: 'waiter-waitress' },
    include: { subdepartment: true },
  });

  const existingSeedOrder = await prisma.order.findFirst({
    where: {
      company_id: company.id,
      title: { startsWith: 'Four Seasons Baku' },
    },
    select: { id: true },
  });

  if (!existingSeedOrder) {
    await prisma.order.create({
    data: {
      company_id: company.id,
      title: 'Four Seasons Baku banket xidməti',
      description: 'Axşam tədbiri üçün premium servis və zal dəstəyi.',
      category: waiterPosition?.name_az ?? 'Ofisiant',
      shift_start: new Date(Date.now() + 24 * 60 * 60 * 1000),
      shift_end: new Date(Date.now() + 36 * 60 * 60 * 1000),
      required_count: 2,
      required_skills: ['Servis', 'Qonaq qarşılama'],
      location: 'Hilton Baku, Bakı',
      pay_rate: 18,
      notes: 'Banket növbəsi; klassik uniforma tələb olunur',
      status: 'active',
      category_items: {
        create: {
          category: waiterPosition?.name_az ?? 'Ofisiant',
          department_id: waiterPosition?.subdepartment.department_id,
          subdepartment_id: waiterPosition?.subdepartment_id,
          position_id: waiterPosition?.id,
          required_count: 2,
          notes: 'Banket novbesi; klassik uniforma teleb olunur',
        },
      },
    },
    });
  }
  console.log('Order seed reconciled.');

  console.log('Seed completed without printing credentials.');
}

async function seedRestrictedAdmin(input: {
  phone: string;
  email: string;
  name: string;
  permissions: string[];
  password_hash: string;
  reconcile_password?: boolean;
}) {
  const user = await prisma.user.upsert({
    where: { phone: input.phone },
    update: {
      email: input.email,
      role: 'admin',
      name: input.name,
      is_active: true,
      ...(input.reconcile_password
        ? {
            password_hash: input.password_hash,
            password_set_at: new Date(),
            deleted_at: null,
          }
        : {}),
    },
    create: {
      phone: input.phone,
      email: input.email,
      password_hash: input.password_hash,
      password_set_at: new Date(),
      role: 'admin',
      name: input.name,
      is_active: true,
    },
  });

  await prisma.admin.upsert({
    where: { user_id: user.id },
    update: { permissions: input.permissions },
    create: { user_id: user.id, permissions: input.permissions },
  });
  console.log('Restricted admin seed reconciled.');
}

async function seedTaxonomy() {
  for (const departmentSeed of TAXONOMY_SEED) {
    const department = await prisma.department.upsert({
      where: { slug: departmentSeed.slug },
      update: {
        name_az: departmentSeed.name_az,
        name_en: departmentSeed.name_en ?? null,
        status: 'active',
      },
      create: {
        slug: departmentSeed.slug,
        name_az: departmentSeed.name_az,
        name_en: departmentSeed.name_en ?? null,
        status: 'active',
      },
    });

    for (const subdepartmentSeed of departmentSeed.subdepartments) {
      const subdepartment = await prisma.subdepartment.upsert({
        where: { slug: subdepartmentSeed.slug },
        update: {
          department_id: department.id,
          name_az: subdepartmentSeed.name_az,
          name_en: subdepartmentSeed.name_en ?? null,
          status: 'active',
        },
        create: {
          department_id: department.id,
          slug: subdepartmentSeed.slug,
          name_az: subdepartmentSeed.name_az,
          name_en: subdepartmentSeed.name_en ?? null,
          status: 'active',
        },
      });

      for (const positionSeed of subdepartmentSeed.positions) {
        await prisma.position.upsert({
          where: { slug: positionSeed.slug },
          update: {
            subdepartment_id: subdepartment.id,
            name_az: positionSeed.name_az,
            name_en: positionSeed.name_en ?? null,
            status: 'active',
          },
          create: {
            subdepartment_id: subdepartment.id,
            slug: positionSeed.slug,
            name_az: positionSeed.name_az,
            name_en: positionSeed.name_en ?? null,
            status: 'active',
          },
        });
      }
    }
  }

  const positionCount = await prisma.position.count({ where: { status: 'active' } });
  console.log('Taxonomy seed reconciled.', { position_count: positionCount });
}

async function seedWorker(input: {
  phone: string;
  name: string;
  position: string;
  status: string;
  skills: Array<Record<string, unknown>>;
  languages: string[];
  password_hash: string;
  reconcile_password?: boolean;
  reject_reason?: string;
  position_slug?: string;
}) {
  const user = await prisma.user.upsert({
    where: { phone: input.phone },
    update: {
      role: 'worker',
      name: input.name,
      is_active: true,
      ...(input.reconcile_password
        ? {
            password_hash: input.password_hash,
            password_set_at: new Date(),
            deleted_at: null,
          }
        : {}),
    },
    create: {
      phone: input.phone,
      role: 'worker',
      name: input.name,
      password_hash: input.password_hash,
      password_set_at: new Date(),
    },
  });

  const worker = await prisma.worker.upsert({
    where: { user_id: user.id },
    update: {
      position: input.position,
      status: input.status,
      skills: input.skills,
      languages: input.languages,
      reject_reason: input.reject_reason ?? null,
      approved_at: input.status === 'approved' ? new Date() : null,
      ...(input.reconcile_password ? { deleted_at: null } : {}),
    },
    create: {
      user_id: user.id,
      position: input.position,
      status: input.status,
      skills: input.skills,
      languages: input.languages,
      reject_reason: input.reject_reason,
      approved_at: input.status === 'approved' ? new Date() : null,
    },
  });

  if (input.position_slug) {
    const position = await prisma.position.findUnique({
      where: { slug: input.position_slug },
      select: { id: true },
    });
    if (position) {
      await prisma.workerPosition.upsert({
        where: {
          worker_id_position_id: {
            worker_id: worker.id,
            position_id: position.id,
          },
        },
        update: {},
        create: {
          worker_id: worker.id,
          position_id: position.id,
        },
      });
    }
  }
  console.log('Worker seed reconciled.', { status: input.status });
}

main()
  .catch((e) => {
    console.error('Seed failed.', { error_type: safeSeedErrorName(e) });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
