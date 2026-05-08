/**
 * Dev seed skripti — test məlumatları yaradır
 * İstifadə: npx ts-node scripts/seed.ts
 *
 * Yaradılır:
 *  - 1 super_admin  (+994700000001)
 *  - 1 company      (+994700000002, approved)
 *  - 3 worker       (+994700000003..5)
 *  - 1 active order
 */

import 'dotenv/config';

/* eslint-disable @typescript-eslint/no-var-requires */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seed başlayır...\n');

  // Super admin
  const admin = await prisma.user.upsert({
    where: { phone: '+994700000001' },
    update: {},
    create: {
      phone: '+994700000001',
      role: 'super_admin',
      name: 'Super Admin',
    },
  });
  console.log('✓ Super admin:', admin.phone);

  // Company user
  const companyUser = await prisma.user.upsert({
    where: { phone: '+994700000002' },
    update: {},
    create: {
      phone: '+994700000002',
      role: 'company',
      name: 'Grand Hotel Baku',
    },
  });

  await prisma.company.upsert({
    where: { user_id: companyUser.id },
    update: {},
    create: {
      user_id: companyUser.id,
      name: 'Grand Hotel Baku',
      status: 'approved',
    },
  });
  console.log('✓ Company:', companyUser.phone, '(approved)');

  // Workers
  const workerData = [
    { phone: '+994700000003', name: 'Əli Həsənov', skills: [{ name: 'aşpaz', level: 4 }, { name: 'ofisiant', level: 3 }] },
    { phone: '+994700000004', name: 'Leyla Əliyeva', skills: [{ name: 'ofisiant', level: 5 }] },
    { phone: '+994700000005', name: 'Rauf Quliyev', skills: [{ name: 'aşpaz', level: 3 }, { name: 'bartender', level: 2 }] },
  ];

  for (const wd of workerData) {
    const wu = await prisma.user.upsert({
      where: { phone: wd.phone },
      update: {},
      create: { phone: wd.phone, role: 'worker', name: wd.name },
    });
    await prisma.worker.upsert({
      where: { user_id: wu.id },
      update: {},
      create: { user_id: wu.id, skills: wd.skills, availability: true },
    });
    console.log('✓ Worker:', wd.phone, wd.name);
  }

  // Active order
  const company = await prisma.company.findUnique({ where: { user_id: companyUser.id } });
  const order = await prisma.order.create({
    data: {
      company_id: company.id,
      shift_start: new Date(Date.now() + 24 * 60 * 60 * 1000), // sabah
      shift_end: new Date(Date.now() + 36 * 60 * 60 * 1000),
      required_count: 2,
      required_skills: ['ofisiant', 'aşpaz'],
      notes: 'Banket üçün — formal geyim tələb olunur',
      status: 'active',
    },
  });
  console.log('✓ Order yaradıldı:', order.id);

  console.log('\n✅ Seed tamamlandı!');
  console.log('\nTest OTP: 123456 (bütün nömrələr üçün)');
  console.log('Admin:    +994700000001');
  console.log('Company:  +994700000002');
  console.log('Workers:  +994700000003..5');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
