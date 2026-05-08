import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { generateQrToken, verifyQrToken } from '../../lib/qr';
import { sendPush } from '../../lib/fcm';

export async function getQrToken(userId: string) {
  const company = await prisma.company.findUnique({ where: { user_id: userId } });
  if (!company) throw Errors.notFound('Şirkət tapılmadı');
  if (company.status !== 'approved') throw Errors.forbidden('Şirkət təsdiqlənməyib');

  return generateQrToken(company.id);
}

export async function checkin(userId: string, qrToken: string) {
  const worker = await prisma.worker.findUnique({ where: { user_id: userId } });
  if (!worker) throw Errors.notFound('İşçi tapılmadı');

  const qrResult = verifyQrToken(qrToken);
  if (qrResult.expired) throw Errors.gone('QR token vaxtı keçib — yenilənsin');
  if (!qrResult.valid || !qrResult.companyId) throw Errors.unauthorized('QR token etibarsızdır');

  // İşçinin bu şirkətin aktiv sifarişinə assignment-i varmı?
  const assignment = await prisma.assignment.findFirst({
    where: {
      worker_id: worker.id,
      status: 'accepted',
      order: {
        company_id: qrResult.companyId,
        status: 'active',
      },
    },
    include: { order: { include: { company: { include: { user: true } } } } },
  });
  if (!assignment) throw Errors.forbidden('Aktiv tapşırıq tapılmadı');

  // Artıq checkin var?
  const existing = await prisma.attendanceLog.findFirst({
    where: { assignment_id: assignment.id, checkin_time: { not: null }, checkout_time: null },
  });
  if (existing) throw Errors.conflict('Bu işçi artıq giriş edib');

  const log = await prisma.attendanceLog.create({
    data: { assignment_id: assignment.id, checkin_time: new Date() },
  });

  // Müəssisəyə bildiriş
  if (assignment.order.company.user.fcm_token) {
    const workerUser = await prisma.user.findUnique({ where: { id: userId } });
    await sendPush(assignment.order.company.user.fcm_token, {
      title: 'İşçi gəldi',
      body: `${workerUser?.name} işə başladı`,
    });
  }

  return { log_id: log.id, checkin_time: log.checkin_time };
}

export async function checkout(userId: string, qrToken: string) {
  const worker = await prisma.worker.findUnique({ where: { user_id: userId } });
  if (!worker) throw Errors.notFound('İşçi tapılmadı');

  const qrResult = verifyQrToken(qrToken);
  if (qrResult.expired) throw Errors.gone('QR token vaxtı keçib');
  if (!qrResult.valid || !qrResult.companyId) throw Errors.unauthorized('QR token etibarsızdır');

  const log = await prisma.attendanceLog.findFirst({
    where: {
      assignment: {
        worker_id: worker.id,
        order: { company_id: qrResult.companyId, status: 'active' },
      },
      checkin_time: { not: null },
      checkout_time: null,
    },
  });
  if (!log) throw Errors.badRequest('Giriş qeyd edilməyib — əvvəlcə QR ilə giriş edin');

  const checkoutTime = new Date();
  const updated = await prisma.attendanceLog.update({
    where: { id: log.id },
    data: { checkout_time: checkoutTime },
  });

  const durationMinutes = log.checkin_time
    ? Math.round((checkoutTime.getTime() - log.checkin_time.getTime()) / 60000)
    : 0;

  return { log_id: updated.id, checkout_time: updated.checkout_time, duration_minutes: durationMinutes };
}
