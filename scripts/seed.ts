import 'dotenv/config';

/* eslint-disable @typescript-eslint/no-var-requires */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seed starting...\n');

  const admin = await prisma.user.upsert({
    where: { phone: '+994700000001' },
    update: { role: 'super_admin', name: 'Super Admin', is_active: true },
    create: {
      phone: '+994700000001',
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

  const companyUser = await prisma.user.upsert({
    where: { phone: '+994700000002' },
    update: { role: 'company', name: 'Grand Hotel Owner', is_active: true },
    create: {
      phone: '+994700000002',
      role: 'company',
      name: 'Grand Hotel Owner',
    },
  });

  const company = await prisma.company.upsert({
    where: { user_id: companyUser.id },
    update: { name: 'Grand Hotel Baku', status: 'approved', approved_at: new Date() },
    create: {
      user_id: companyUser.id,
      name: 'Grand Hotel Baku',
      status: 'approved',
      approved_at: new Date(),
    },
  });
  console.log('Approved company:', companyUser.phone);

  await seedWorker({
    phone: '+994700000003',
    name: 'Ali Hasanov',
    position: 'Chef',
    status: 'approved',
    skills: [{ name: 'chef', level: 4 }, { name: 'waiter', level: 3 }],
    languages: ['az', 'tr'],
  });

  await seedWorker({
    phone: '+994700000004',
    name: 'Leyla Aliyeva',
    position: 'Waiter',
    status: 'pending_approval',
    skills: [{ name: 'waiter', level: 5 }],
    languages: ['az', 'en'],
  });

  await seedWorker({
    phone: '+994700000005',
    name: 'Rauf Quliyev',
    position: 'Courier',
    status: 'rejected',
    skills: [{ name: 'delivery', level: 3 }],
    languages: ['az', 'ru'],
    reject_reason: 'Documents are incomplete.',
  });

  const order = await prisma.order.create({
    data: {
      company_id: company.id,
      shift_start: new Date(Date.now() + 24 * 60 * 60 * 1000),
      shift_end: new Date(Date.now() + 36 * 60 * 60 * 1000),
      required_count: 2,
      required_skills: ['waiter', 'chef'],
      notes: 'Banquet shift; formal dress required',
      status: 'active',
    },
  });
  console.log('Active order:', order.id);

  console.log('\nSeed completed.');
  console.log('Test OTP:', process.env.OTP_TEST_CODE ?? '123456');
  console.log('Admin:    +994700000001');
  console.log('Company:  +994700000002');
  console.log('Workers:  +994700000003 approved, +994700000004 pending, +994700000005 rejected');
}

async function seedWorker(input: {
  phone: string;
  name: string;
  position: string;
  status: string;
  skills: Array<Record<string, unknown>>;
  languages: string[];
  reject_reason?: string;
}) {
  const user = await prisma.user.upsert({
    where: { phone: input.phone },
    update: { role: 'worker', name: input.name, is_active: true },
    create: { phone: input.phone, role: 'worker', name: input.name },
  });

  await prisma.worker.upsert({
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
  console.log('Worker:', input.phone, input.status);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
