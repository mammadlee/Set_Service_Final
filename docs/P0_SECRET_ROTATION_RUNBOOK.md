# P0 secret rotation runbook

This runbook covers only the exposed JWT, PG365, and Cloudflare R2 credentials. It does not change the authentication model or database schema.

> **Production stop:** historical R2/S3-compatible credentials in reachable Git
> commits must be treated as compromised and manually revoked in Cloudflare
> before production use. Current placeholders do not revoke an already copied
> credential, and this repository cannot perform that external action.

## Preconditions

- Open an incident/change record and set `JWT_ROTATION_CHANGE_ID` to that identifier.
- Restrict deployment and secret-manager access to the release operators.
- Confirm every API and outbox worker instance reads credentials from the production secret manager. Repository files must contain references only.
- Rotate credentials before rewriting Git history. History rewriting cannot make a copied credential safe again.
- Keep a database backup for operational recovery, but do not restore revoked sessions merely to avoid user re-authentication.

## Required production environment

```dotenv
JWT_ACCESS_SECRET=<secret-reference>
JWT_REFRESH_SECRET=<secret-reference>
PG365_PUBLIC_KEY=<secret-reference>
PG365_PRIVATE_KEY=<secret-reference>
S3_ACCESS_KEY_ID=<r2-access-key-id>
S3_SECRET_ACCESS_KEY=<r2-secret-access-key>
```

`PG365_PURPOSE` is intentionally not configurable. The provider request always uses `INF`.

JWT secrets must be independent 256-bit random values encoded as base64url (43 characters without padding). Generate each value separately inside the approved secret manager or an access-controlled operator session using a cryptographically secure random-byte generator. Never commit or paste generated values into tickets, chat, logs, CI variables, or repository files.

## JWT rotation and global session invalidation

1. Create new, independent `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` secret versions.
2. Deploy the new versions to every API and outbox worker instance. Do not leave an old instance serving traffic.
3. Run the read-only scope preview:

   ```text
   npm run security:jwt-rotation
   ```

4. Set `NODE_ENV=production`, `JWT_ROTATION_CONFIRM=INVALIDATE_ALL_SESSIONS`, and the change-record value in `JWT_ROTATION_CHANGE_ID`; then run:

   ```text
   npm run security:jwt-rotation -- --apply
   ```

5. Verify that protected requests with pre-rotation access tokens fail and that pre-rotation refresh tokens cannot rotate.
6. Verify a fresh login, refresh, and logout. A stale logout request can return an invalid-token response because the old refresh signature is no longer accepted; the database family has already been revoked.
7. Verify registration resumes with a newly issued registration token. Pre-rotation registration tokens are intentionally invalid because they use the access secret and `session_version` check.

The apply operation uses one serializable transaction: every user `session_version` is incremented and every active refresh token is revoked with reason `security_rotation`. Existing refresh reuse detection and per-family logout revoke behavior remain unchanged.

## PG365 credential migration

1. Ask PG365 to issue a new public/private credential pair and confirm the old pair is treated as compromised.
2. Store the new pair under the existing `PG365_PUBLIC_KEY` and `PG365_PRIVATE_KEY` secret references.
3. Deploy API and outbox worker instances together.
4. Run the mock regression before deployment:

   ```text
   npm run test:pg365-sms
   npm run test:provider-delivery
   ```

5. In staging, submit one OTP and one informational SMS. Confirm the body contains `Purpose: INF`, the generated OTP is present in `Text`, and the outbox event reaches delivered state.
6. Exercise one controlled provider rejection. Confirm HTTP 200 with an `ERRSMS` body is marked delivery-failed and the provider error code is logged without the phone, OTP, or private key.
7. Revoke the old PG365 pair immediately after the new pair succeeds. Re-test after revocation to prove no old credential dependency remains.

## Cloudflare R2 credential migration

1. Create a new R2 token scoped only to the production bucket. Grant object read and write capabilities required for upload, signed download, copy/promotion, and delete. Do not grant account administration, Workers, DNS, cache, or access to unrelated buckets.
2. Keep the bucket private. Do not enable a public development URL for private worker documents.
3. Store the new values under `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`; retain the existing bucket-specific endpoint and bucket name references.
4. Deploy all API and worker instances, then perform a uniquely named canary object test:
   - upload a private object;
   - download it only through a short-lived signed URL;
   - confirm anonymous/public access is denied;
   - delete it and confirm the signed URL no longer retrieves it.
5. Revoke the exposed R2 token immediately after the canary succeeds, then repeat upload and delete to prove the old token is not in use.

For AWS S3-compatible policy documents, the application data-plane needs only object-level `GetObject`, `PutObject`, and `DeleteObject` on the selected bucket prefix. It does not require account or bucket administration.

## Git history remediation

The CI scanner now checks every reachable commit and fails on secret material. A full clone is mandatory (`fetch-depth: 0` in CI).

After all exposed credentials have been rotated:

1. Freeze merges and take an access-controlled backup of repository refs.
2. In a fresh mirror clone, use `git filter-repo --replace-text` (or an equivalent reviewed tool) with the compromised values supplied from a temporary file outside the repository.
3. Verify `npm run secrets:check` against all rewritten refs.
4. Force-push the coordinated rewritten branches and tags.
5. Delete temporary replacement files securely, invalidate old CI caches/artifacts where applicable, and require every contributor to re-clone. Old forks and local clones remain a disclosure source and must not be trusted.

Do not record compromised values in the replacement commit message, pull request, or scanner output.

## Rollback plan

| Change | Safe rollback |
| --- | --- |
| Environment placeholders | Revert template wording only. Never restore a credential literal to Git. Runtime secrets remain in the secret manager. |
| Runtime placeholder rejection | Roll back the application commit only if a verified real credential is injected and the validation itself blocks startup. Do not substitute a placeholder. |
| JWT secret deployment | Roll back application code while keeping the new JWT secrets. Never re-enable exposed secrets. Users may need to authenticate again. |
| Global session invalidation | Before `--apply`, stop with no state change. After commit, invalidation is intentionally irreversible; recovery is fresh login, not decrementing `session_version` or un-revoking tokens. |
| PG365/R2 credential switch | Keep the new credential and roll back application code/config routing if needed. If the new credential is unusable, issue another credential; do not restore the exposed one. |
| Secret scanner/CI gate | Revert only a false-positive rule with security approval and a narrow regression fixture. Do not bypass the job or use a shallow clone. |
| Git history rewrite | Restore backup refs only for repository recovery after credentials are already rotated, then correct and repeat the rewrite. Never treat restored history as safe. |
