import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { Role } from "../../types/prisma";

const ratingInclude = {
  assignment: {
    select: {
      id: true,
      status: true,
      assigned_at: true,
    },
  },
  order: {
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      shift_start: true,
      shift_end: true,
      location: true,
      company_id: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  worker: {
    select: {
      id: true,
      position: true,
      rating_avg: true,
      rating_count: true,
      user: { select: { id: true, name: true } },
    },
  },
  rater: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
} satisfies Prisma.RatingInclude;

export type RatingWithRelations = Prisma.RatingGetPayload<{
  include: typeof ratingInclude;
}>;

type CreateRatingWithAggregateResult =
  | { kind: "duplicate" }
  | { kind: "created"; rating: RatingWithRelations };

type CreateRatingTransactionResult =
  | { kind: "duplicate" }
  | { kind: "created"; ratingId: string };

const rateableAssignmentInclude = {
  order: {
    select: {
      id: true,
      title: true,
      company_id: true,
      deleted_at: true,
      company: {
        select: {
          id: true,
          user_id: true,
          name: true,
        },
      },
    },
  },
  worker: {
    select: {
      id: true,
      deleted_at: true,
      user_id: true,
      user: { select: { id: true, name: true } },
    },
  },
  attendance_logs: {
    where: { deleted_at: null, checkout_time: { not: null } },
    select: { id: true, checkout_time: true },
    orderBy: { checkout_time: "desc" },
    take: 1,
  },
} satisfies Prisma.AssignmentInclude;

export type RateableAssignment = Prisma.AssignmentGetPayload<{
  include: typeof rateableAssignmentInclude;
}>;

const RATING_TRANSACTION_RETRIES = 3;

export function findApprovedCompanyByUserId(userId: string) {
  return prisma.company.findUnique({
    where: { user_id: userId },
    select: { id: true, status: true, deleted_at: true },
  });
}

export function findApprovedWorkerByUserId(userId: string) {
  return prisma.worker.findUnique({
    where: { user_id: userId },
    select: { id: true, status: true, deleted_at: true },
  });
}

export function findWorkerSummary(workerId: string) {
  return prisma.worker.findFirst({
    where: { id: workerId, deleted_at: null },
    select: { id: true, rating_avg: true, rating_count: true },
  });
}

export function findRateableAssignment(input: {
  assignmentId?: string;
  orderId?: string;
  workerId?: string;
  companyId: string;
}) {
  return prisma.assignment.findFirst({
    where: {
      ...(input.assignmentId ? { id: input.assignmentId } : {}),
      ...(input.orderId ? { order_id: input.orderId } : {}),
      ...(input.workerId ? { worker_id: input.workerId } : {}),
      status: { in: ["accepted", "completed"] },
      deleted_at: null,
      worker: { deleted_at: null },
      order: { company_id: input.companyId, deleted_at: null },
      attendance_logs: {
        some: {
          deleted_at: null,
          checkout_time: { not: null },
        },
      },
    },
    include: rateableAssignmentInclude,
  });
}

export function listWorkerRatings(workerId: string) {
  return prisma.rating.findMany({
    where: { worker_id: workerId, deleted_at: null },
    include: ratingInclude,
    orderBy: { created_at: "desc" },
  });
}

export async function createRatingWithAggregate(input: {
  actorId: string;
  actorRole: Role;
  assignment: RateableAssignment;
  score: number;
  comment?: string;
}): Promise<CreateRatingWithAggregateResult> {
  const result = await withSerializableRatingRetry<CreateRatingTransactionResult>(() =>
    prisma.$transaction(
      async (
        tx: Prisma.TransactionClient,
      ): Promise<CreateRatingTransactionResult> => {
        const duplicate = await tx.rating.findFirst({
          where: {
            deleted_at: null,
            OR: [
              { assignment_id: input.assignment.id },
              {
                order_id: input.assignment.order_id,
                worker_id: input.assignment.worker_id,
              },
            ],
          },
          select: { id: true },
        });

        if (duplicate) return { kind: "duplicate" as const };

        const rating = await tx.rating.create({
          data: {
            assignment_id: input.assignment.id,
            order_id: input.assignment.order_id,
            worker_id: input.assignment.worker_id,
            rater_id: input.actorId,
            score: input.score,
            comment: input.comment,
          },
          select: { id: true },
        });

        const aggregate = await tx.rating.aggregate({
          where: { worker_id: input.assignment.worker_id, deleted_at: null },
          _avg: { score: true },
          _count: { _all: true },
        });

        await tx.worker.update({
          where: { id: input.assignment.worker_id },
          data: {
            rating_avg: aggregate._avg.score ?? 0,
            rating_count: aggregate._count._all,
          },
        });

        await tx.auditLog.create({
          data: {
            actor_id: input.actorId,
            actor_role: input.actorRole,
            action: "rating_created",
            entity_type: "rating",
            entity_id: rating.id,
            metadata: {
              assignment_id: input.assignment.id,
              order_id: input.assignment.order_id,
              worker_id: input.assignment.worker_id,
              score: input.score,
            },
          },
        });

        return { kind: "created" as const, ratingId: rating.id };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      },
    ),
  );

  if (result.kind === "duplicate") return result;

  const rating = await prisma.rating.findUniqueOrThrow({
    where: { id: result.ratingId },
    include: ratingInclude,
  });

  return { kind: "created" as const, rating };
}

export function createRatingNotification(input: {
  recipientId: string;
  ratingId: string;
  assignmentId: string;
  orderId: string;
  orderTitle: string;
  score: number;
}) {
  return prisma.notification.create({
    data: {
      recipient_id: input.recipientId,
      type: "system",
      title: "Yeni reytinq ald\u0131n\u0131z",
      body: `"${input.orderTitle}" n\u00f6vb\u0259si \u00fczr\u0259 ${input.score} ulduz reytinq ald\u0131n\u0131z.`,
      metadata: {
        rating_id: input.ratingId,
        assignment_id: input.assignmentId,
        order_id: input.orderId,
        score: input.score,
      },
    },
  });
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function withSerializableRatingRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RATING_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isTransactionWriteConflict(error) ||
        attempt === RATING_TRANSACTION_RETRIES
      ) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError;
}

function isTransactionWriteConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}
