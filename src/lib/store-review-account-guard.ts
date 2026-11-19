import { Errors } from './errors';
import { Role } from '../types/prisma';
import type { StoreReviewAuthenticationMethod } from './store-review-fixed-otp';

export type ReviewAccountMarker = {
  is_review_account: boolean;
};

export function assertStoreReviewAccountMutationAllowed(
  account: ReviewAccountMarker | null | undefined,
): void {
  if (!account?.is_review_account) return;
  throw Errors.forbidden(
    'This shared store review account cannot change its sign-in identity or be deleted.',
    'STORE_REVIEW_ACCOUNT_MUTATION_FORBIDDEN',
  );
}

export function assertStoreReviewAuthenticationScope(
  account: ReviewAccountMarker,
  authentication: StoreReviewAuthenticationMethod,
): void {
  const reviewerOtpWasUsed = authentication === 'password_reviewer_fixed_otp';
  if (account.is_review_account === reviewerOtpWasUsed) return;

  throw Errors.conflict(
    'The account security scope changed during sign-in. Please try again.',
    'AUTH_ACCOUNT_SCOPE_CHANGED',
  );
}

export function buildStoreReviewLoginAudit(
  user: { id: string; role: Role },
  authentication: StoreReviewAuthenticationMethod = 'password',
) {
  return {
    actor_id: user.id,
    actor_role: user.role,
    action: 'login_succeeded' as const,
    entity_type: 'store_review_account',
    entity_id: user.id,
    metadata: {
      authentication,
      role: user.role,
    },
  };
}
