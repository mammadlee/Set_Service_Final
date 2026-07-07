import 'dotenv/config';

/* eslint-disable @typescript-eslint/no-var-requires */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { TAXONOMY_SEED } = require('../src/modules/taxonomy/taxonomy.seed');
const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@setservice.az';
const ADMIN_PASSWORD = seedPassword('SEED_ADMIN_PASSWORD');
const COMPANY_EMAIL = process.env.SEED_COMPANY_EMAIL ?? 'company@setservice.az';
const COMPANY_PASSWORD = seedPassword('SEED_COMPANY_PASSWORD');
const WORKER_PASSWORD = seedPassword('SEED_WORKER_PASSWORD');
const OPS_ADMIN_EMAIL = process.env.SEED_OPS_ADMIN_EMAIL ?? 'ops@setservice.az';
const REPORTS_ADMIN_EMAIL = process.env.SEED_REPORTS_ADMIN_EMAIL ?? 'reports@setservice.az';
const RESTRICTED_ADMIN_PASSWORD = process.env.SEED_RESTRICTED_ADMIN_PASSWORD?.trim() || ADMIN_PASSWORD;

const OPS_ADMIN_PERMISSIONS = [
  'view_dashboard',
  'view_workers',
  'manage_workers',
  'view_orders',
  'view_assignments',
  'manage_assignments',
  'view_attendance',
  'view_notifications',
];

const REPORTS_ADMIN_PERMISSIONS = [
  'view_dashboard',
  'view_reports',
  'view_workers',
  'view_companies',
  'view_orders',
];

async function main() {
  console.log('Seed starting...\n');
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const companyPasswordHash = await bcrypt.hash(COMPANY_PASSWORD, 12);
  const workerPasswordHash = await bcrypt.hash(WORKER_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { phone: '+994700000001' },
    update: {
      email: ADMIN_EMAIL,
      password_hash: adminPasswordHash,
      password_set_at: new Date(),
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
  console.log('Super admin:', admin.phone);

  await seedRestrictedAdmin({
    phone: '+994700000101',
    email: OPS_ADMIN_EMAIL,
    name: 'Operations Admin',
    permissions: OPS_ADMIN_PERMISSIONS,
    password_hash: adminPasswordHash,
  });

  await seedRestrictedAdmin({
    phone: '+994700000102',
    email: REPORTS_ADMIN_EMAIL,
    name: 'Reports Admin',
    permissions: REPORTS_ADMIN_PERMISSIONS,
    password_hash: adminPasswordHash,
  });

  await seedTaxonomy();

  const companyUser = await prisma.user.upsert({
    where: { phone: '+994700000002' },
    update: {
      email: COMPANY_EMAIL,
      password_hash: companyPasswordHash,
      password_set_at: new Date(),
      role: 'company',
      name: 'Hilton Baku Əməliyyat Meneceri',
      is_active: true,
    },
    create: {
      phone: '+994700000002',
      email: COMPANY_EMAIL,
      password_hash: companyPasswordHash,
      password_set_at: new Date(),
      role: 'company',
      name: 'Hilton Baku Əməliyyat Meneceri',
    },
  });

  const company = await prisma.company.upsert({
    where: { user_id: companyUser.id },
    update: { name: 'Hilton Baku', status: 'approved', approved_at: new Date() },
    create: {
      user_id: companyUser.id,
      name: 'Hilton Baku',
      status: 'approved',
      approved_at: new Date(),
    },
  });
  console.log('Approved company:', companyUser.phone);

  await seedWorker({
    phone: '+994700000003',
    name: 'Elvin Məmmədov',
    position: 'Ofisiant',
    status: 'approved',
    skills: [{ name: 'Servis', level: 4 }, { name: 'Qonaq qarşılama', level: 3 }],
    languages: ['Azərbaycan', 'English'],
    password_hash: workerPasswordHash,
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

  const order = await prisma.order.create({
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
  console.log('Active order:', order.id);

  console.log('\nSeed completed.');
  console.log('OTP kodu:', process.env.OTP_TEST_CODE ?? '123456');
  console.log(`Admin:    ${ADMIN_EMAIL} / ${passwordSource('SEED_ADMIN_PASSWORD', ADMIN_PASSWORD)}`);
  console.log(`Ops:      ${OPS_ADMIN_EMAIL} / ${passwordSource('SEED_RESTRICTED_ADMIN_PASSWORD', RESTRICTED_ADMIN_PASSWORD)}`);
  console.log(`Reports:  ${REPORTS_ADMIN_EMAIL} / ${passwordSource('SEED_RESTRICTED_ADMIN_PASSWORD', RESTRICTED_ADMIN_PASSWORD)}`);
  console.log(`Company:  ${COMPANY_EMAIL} / ${passwordSource('SEED_COMPANY_PASSWORD', COMPANY_PASSWORD)}`);
  console.log('Workers:  +994700000003 approved, +994700000004 pending, +994700000005 rejected');
}

function seedPassword(envName: string): string {
  const provided = process.env[envName]?.trim();
  if (provided) return provided;
  return `${crypto.randomBytes(18).toString('base64url')}Aa1!`;
}

function passwordSource(envName: string, generated: string): string {
  return process.env[envName]?.trim() ? '(from env)' : generated;
}

async function seedRestrictedAdmin(input: {
  phone: string;
  email: string;
  name: string;
  permissions: string[];
  password_hash: string;
}) {
  const user = await prisma.user.upsert({
    where: { phone: input.phone },
    update: {
      email: input.email,
      password_hash: input.password_hash,
      password_set_at: new Date(),
      role: 'admin',
      name: input.name,
      is_active: true,
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
  console.log('Restricted admin:', input.email);
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
  console.log('Taxonomy positions:', positionCount);
}

async function seedWorker(input: {
  phone: string;
  name: string;
  position: string;
  status: string;
  skills: Array<Record<string, unknown>>;
  languages: string[];
  password_hash: string;
  reject_reason?: string;
  position_slug?: string;
}) {
  const user = await prisma.user.upsert({
    where: { phone: input.phone },
    update: {
      role: 'worker',
      name: input.name,
      password_hash: input.password_hash,
      password_set_at: new Date(),
      is_active: true,
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
  console.log('Worker:', input.phone, input.status);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
