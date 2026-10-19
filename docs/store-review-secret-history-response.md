# Store review release: historical secret response

This runbook records only secret categories and response steps. Never paste a
credential, connection string, private key, account endpoint, or credential
fingerprint into this file, a ticket, CI output, or chat.

## Current audit result

The current working tree passes the scanner's `--current-only` mode. The full
Git history scan exits non-zero and reports 61 matches in five ancestor commits
across historical configuration and deployment documents:

- 57 literal sensitive assignments;
- 2 private-key markers;
- 2 R2 account-endpoint markers.

The affected categories are authentication material (legacy JWT, OTP and QR),
database and Redis connection credentials, object-storage credentials, and
Firebase, SMS, and email provider credentials. Some matches are recognizable
examples, while others cannot be proven inactive from Git alone. Treat every
unverified match as potentially active.

## Required inventory gate

An operator with secret-manager access must compare the historical credential
identities with the currently configured services without printing either
value. Record only one of these outcomes for each category:

- confirmed example and never accepted by a real service;
- previously active and already revoked, with the revocation date;
- active or status unknown, requiring rotation before release.

The store-review release is blocked while any category remains `active or
status unknown`.

## Rotation order

1. Create replacement Firebase and R2/S3 credentials with the minimum required
   permissions. Deploy and verify them, then revoke the historical credentials.
2. Rotate SMS and email provider credentials and verify only controlled test
   delivery. Revoke the previous provider credentials.
3. Create new database and Redis credentials, perform a rolling cutover, verify
   application health, and then revoke the previous credentials. Do not expose
   connection strings in command output.
4. Rotate JWT access and refresh secrets together. Increment/revoke application
   sessions so tokens signed by a historical key cannot remain valid. Expect
   users to sign in again.
5. Rotate the QR HMAC secret after the maximum QR lifetime has elapsed. Existing
   short-lived QR tokens may be invalidated during the maintenance window.
6. Rotate the OTP pepper after all outstanding OTP challenges have expired.
7. Re-run the current-tree and full-history scanners. A history match may remain
   until history cleanup, but every operational credential it represented must
   already be revoked.

## History cleanup

Credential rotation is the containment step. Rewriting Git history is optional
cleanup and never replaces revocation. If history is rewritten, coordinate the
force update and fresh clones with every repository consumer, preserve the
release audit trail separately, and run the full-history scanner before access
is restored.

## Evidence allowed in the release record

The release record may contain the credential category, provider, rotation or
revocation timestamp, operator identity, and verification result. It must not
contain the secret value, a reversible encoding, a private-key body, a signed
URL, a connection string, or a reusable credential fingerprint.
