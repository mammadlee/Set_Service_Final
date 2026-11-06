import { Errors } from './errors';
import { Role } from '../types/prisma';

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

export function buildStoreReviewLoginAudit(user: { id: string; role: Role }) {
  return {
    actor_id: user.id,
    actor_role: user.role,
    action: 'login_succeeded' as const,
    entity_type: 'store_review_account',
    entity_id: user.id,
    metadata: {
      authentication: 'password',
      role: user.role,
    },
  };
}
