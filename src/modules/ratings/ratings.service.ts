import { Errors } from '../../lib/errors';
import { sendPushToUser } from '../../lib/fcm';
import { logger } from '../../lib/logger';
import { Role } from '../../types/prisma';
import { CreateRatingInput } from './ratings.schema';
import * as RatingsRepository from './ratings.repository';

type RatingRecord = RatingsRepository.RatingWithRelations;

export async function createRating(
  raterId: string,
  roleValue: string,
  input: CreateRatingInput
) {
  const role = parseRole(roleValue);
  if (role !== 'company') {
    throw Errors.forbidden('Yalnız təsdiqlənmiş şirkətlər işçiləri qiymətləndirə bilər.', 'ROLE_FORBIDDEN');
  }

  const company = await RatingsRepository.findApprovedCompanyByUserId(raterId);
  if (!company || company.deleted_at) throw Errors.notFound('Şirkət profili tapılmadı.', 'COMPANY_NOT_FOUND');
  if (company.status !== 'approved') {
    throw Errors.forbidden('Reytinq vermək üçün şirkət hesabı təsdiqlənməlidir.', 'ACCOUNT_NOT_APPROVED', {
      status: company.status,
    });
  }

  const assignment = await RatingsRepository.findRateableAssignment({
    assignmentId: input.assignment_id,
    orderId: input.order_id,
    workerId: input.worker_id,
    companyId: company.id,
  });

  if (!assignment) {
    throw Errors.conflict(
      'İşçi yalnız bu şirkət tapşırığı üzrə checkout tamamlandıqdan sonra qiymətləndirilə bilər.',
      'RATING_NOT_AVAILABLE'
    );
  }

  const comment = (input.feedback ?? input.comment)?.trim() || undefined;

  try {
    const result = await RatingsRepository.createRatingWithAggregate({
      actorId: raterId,
      actorRole: role,
      assignment,
      score: input.score,
      comment,
    });

    if (result.kind === 'duplicate') {
      throw Errors.conflict('Bu tapşırıq artıq qiymətləndirilib.', 'DUPLICATE_RATING');
    }

    await createRatingNotificationSafely({
      recipientId: assignment.worker.user_id,
      ratingId: result.rating.id,
      assignmentId: assignment.id,
      orderId: assignment.order_id,
      orderTitle: assignment.order.title,
      score: input.score,
    });

    await sendPushToUser(assignment.worker.user.id, {
      title: 'Yeni reytinq aldınız',
      body: `"${assignment.order.title}" növbəsi üzrə ${input.score} ulduz reytinq aldınız.`,
      data: {
        type: 'rating_created',
        rating_id: result.rating.id,
        assignment_id: assignment.id,
        order_id: assignment.order_id,
        role: 'worker',
      },
    });

    return toRatingResponse(result.rating);
  } catch (error) {
    if (RatingsRepository.isUniqueConstraintError(error)) {
      throw Errors.conflict('Bu tapşırıq artıq qiymətləndirilib.', 'DUPLICATE_RATING');
    }
    throw error;
  }
}

async function createRatingNotificationSafely(
  input: Parameters<typeof RatingsRepository.createRatingNotification>[0],
): Promise<void> {
  try {
    await RatingsRepository.createRatingNotification(input);
  } catch (error) {
    logger.warn('Rating notification creation skipped after non-fatal error', {
      rating_id: input.ratingId,
      assignment_id: input.assignmentId,
      order_id: input.orderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getMyRatings(userId: string, roleValue: string) {
  const role = parseRole(roleValue);
  if (role !== 'worker') {
    throw Errors.forbidden('Yalnız işçilər öz reytinqlərinə baxa bilər.', 'ROLE_FORBIDDEN');
  }

  const worker = await RatingsRepository.findApprovedWorkerByUserId(userId);
  if (!worker || worker.deleted_at) throw Errors.notFound('İşçi profili tapılmadı.', 'WORKER_NOT_FOUND');
  if (worker.status !== 'approved') {
    throw Errors.forbidden('Reytinqlərə baxmaq üçün işçi hesabı təsdiqlənməlidir.', 'ACCOUNT_NOT_APPROVED', {
      status: worker.status,
    });
  }

  return getWorkerRatingSummary(worker.id);
}

export async function getWorkerRatings(workerId: string, requesterRole?: string) {
  if (requesterRole) {
    const role = parseRole(requesterRole);
    if (role !== 'super_admin' && role !== 'admin') {
      throw Errors.forbidden('İşçi reytinq tarixçəsinə yalnız admin baxa bilər.', 'ROLE_FORBIDDEN');
    }
  }

  return getWorkerRatingSummary(workerId);
}

async function getWorkerRatingSummary(workerId: string) {
  const worker = await RatingsRepository.findWorkerSummary(workerId);
  if (!worker) throw Errors.notFound('İşçi tapılmadı.', 'WORKER_NOT_FOUND');

  const ratings = await RatingsRepository.listWorkerRatings(workerId);
  const data = ratings.map(toRatingResponse);
  return {
    rating_avg: worker.rating_avg,
    rating_count: worker.rating_count,
    avg: worker.rating_avg,
    total: worker.rating_count,
    data,
    ratings: data,
  };
}

function parseRole(role: string): Role {
  if (role === 'super_admin' || role === 'admin' || role === 'company' || role === 'worker') return role;
  throw Errors.forbidden('Hesab rolu dəstəklənmir.', 'ROLE_FORBIDDEN');
}

function toRatingResponse(rating: RatingRecord) {
  return {
    id: rating.id,
    assignment_id: rating.assignment_id,
    order_id: rating.order_id,
    worker_id: rating.worker_id,
    rater_id: rating.rater_id,
    score: rating.score,
    feedback: rating.comment,
    comment: rating.comment,
    created_at: rating.created_at,
    assignment: rating.assignment
      ? {
          id: rating.assignment.id,
          status: rating.assignment.status,
          assigned_at: rating.assignment.assigned_at,
        }
      : null,
    order: {
      id: rating.order.id,
      title: rating.order.title,
      category: rating.order.category,
      status: rating.order.status,
      start_datetime: rating.order.shift_start,
      end_datetime: rating.order.shift_end,
      location: rating.order.location,
      company: rating.order.company,
    },
    worker: {
      id: rating.worker.id,
      name: rating.worker.user.name,
      position: rating.worker.position,
      rating_avg: rating.worker.rating_avg,
      rating_count: rating.worker.rating_count,
    },
    rater: rating.rater,
  };
}
