/**
 * Store-review accounts are an isolated, synthetic cohort. They may receive
 * durable in-app notifications, but must never reach an external provider.
 * Keeping the decision in one small module makes every delivery path use the
 * same fail-closed rule.
 */
export type ReviewAccountMarker = Readonly<{
  is_review_account?: boolean | null;
}>;

export function isStoreReviewAccount(account: ReviewAccountMarker | boolean): boolean {
  return typeof account === 'boolean'
    ? account
    : account.is_review_account === true;
}

export function mayDeliverExternally(account: ReviewAccountMarker | boolean): boolean {
  if (typeof account === 'boolean') return account === false;
  // Captured provider targets without an explicit cohort marker are unsafe.
  // Suppress them rather than guessing that they belong to production.
  return account.is_review_account === false;
}

export function filterExternalDeliveryTargets<
  T extends ReviewAccountMarker,
>(targets: readonly T[]): T[] {
  return targets.filter(mayDeliverExternally);
}
