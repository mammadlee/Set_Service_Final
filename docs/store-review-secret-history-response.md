# Store review release: historical secret response

This runbook records only secret categories and response steps. Never paste a
credential, connection string, private key, account endpoint, or credential
fingerprint into this file, a ticket, CI output, or chat.

## Current audit result

The current working tree passes the scanner's `--current-only` mode. The full
Git history scan exits non-zero and reports 99 matches in six ancestor commits
across historical configuration and deployment documents:

- 92 literal sensitive assignments;
- 4 private-key markers;
- 3 R2 account-endpoint markers.

The evidence ledger resolves 54 exact synthetic matches and the 3 exact R2
account-endpoint metadata matches. The remaining 42 matches across 11
credential identities continue to block the full-history gate.

The unresolved categories are authentication material (legacy JWT and QR),
database and Redis connection credentials, object-storage credentials, and
SMS and email provider credentials. The Firebase-like private-key fragments
are verified synthetic documentation examples. Other matches cannot be proven
inactive from Git alone, so treat every unverified match as potentially active.

## Verified synthetic findings

The 54 entries below are documentation-only synthetic values. Their exact
commit/path/line/rule coordinates are mirrored in
`config/historical-secret-evidence.json`; the scanner may reconcile only those
exact coordinates. This is not a value-based allowlist and it stores no value,
hash, endpoint, credential fingerprint, or reversible encoding.

The evidence ledger is fail-closed: stale or duplicate coordinates are errors,
current-tree findings can never be reconciled, and `active` or `unknown`
identities always keep the full-history gate red. A `revoked` or `never-issued`
classification is accepted only with provider, verification timestamp,
operator reference, change record, and evidence reference metadata.

The evidence rules are deliberately narrow:

- `explicit marker`: the assigned value itself contains an unambiguous
  example/test/change/your marker;
- `synthetic Neon host`: the database hostname itself contains an unambiguous
  synthetic marker;
- `invalid PEM`: the short documentation fragment is not a usable private key
  and is rejected by Node `crypto.createPrivateKey`.

| Commit | Path | Line | Rule | Evidence |
| --- | --- | ---: | --- | --- |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `.env.example` | 9 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `.env.example` | 14 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `.env.example` | 56 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `ENV_SETUP.md` | 50 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `ENV_SETUP.md` | 54 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `ENV_SETUP.md` | 87 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `ENV_SETUP.md` | 103 | `literal-secret-assignment` | synthetic Neon host |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `ENV_SETUP.md` | 104 | `literal-secret-assignment` | synthetic Neon host |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `ENV_SETUP.md` | 182 | `private-key` | invalid PEM |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `ENV_SETUP.md` | 182 | `literal-secret-assignment` | invalid PEM |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `PRODUCTION_READINESS.md` | 79 | `private-key` | invalid PEM |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `PRODUCTION_READINESS.md` | 79 | `literal-secret-assignment` | invalid PEM |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `README.md` | 137 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `README.md` | 138 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `STAGING_DEPLOYMENT.md` | 22 | `literal-secret-assignment` | synthetic Neon host |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `STAGING_DEPLOYMENT.md` | 23 | `literal-secret-assignment` | synthetic Neon host |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `STAGING_DEPLOYMENT.md` | 46 | `literal-secret-assignment` | synthetic Neon host |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `STAGING_DEPLOYMENT.md` | 47 | `literal-secret-assignment` | synthetic Neon host |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `STAGING_DEPLOYMENT.md` | 51 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `STAGING_DEPLOYMENT.md` | 52 | `literal-secret-assignment` | explicit marker |
| `b65cdc7ca1ef346233b3694b77a42d4659cf1109` | `STAGING_DEPLOYMENT.md` | 53 | `literal-secret-assignment` | explicit marker |
| `c902a5a6fb2a11a60e2854f5ab34e953130c58e0` | `.env.example` | 9 | `literal-secret-assignment` | explicit marker |
| `c902a5a6fb2a11a60e2854f5ab34e953130c58e0` | `.env.example` | 14 | `literal-secret-assignment` | explicit marker |
| `c902a5a6fb2a11a60e2854f5ab34e953130c58e0` | `.env.example` | 56 | `literal-secret-assignment` | explicit marker |
| `c902a5a6fb2a11a60e2854f5ab34e953130c58e0` | `README.md` | 137 | `literal-secret-assignment` | explicit marker |
| `c902a5a6fb2a11a60e2854f5ab34e953130c58e0` | `README.md` | 138 | `literal-secret-assignment` | explicit marker |
| `cff3579d01897affcaa41d2542cbe1612b5af9e8` | `.env.example` | 5 | `literal-secret-assignment` | explicit marker |
| `cff3579d01897affcaa41d2542cbe1612b5af9e8` | `.env.example` | 10 | `literal-secret-assignment` | explicit marker |
| `cff3579d01897affcaa41d2542cbe1612b5af9e8` | `.env.example` | 29 | `literal-secret-assignment` | explicit marker |
| `f448450d64e71ef2120752551d8ef230ebe35f57` | `.env.example` | 5 | `literal-secret-assignment` | explicit marker |
| `f448450d64e71ef2120752551d8ef230ebe35f57` | `.env.example` | 10 | `literal-secret-assignment` | explicit marker |
| `d5910b8975108651059f222566d234d39412fb52` | `.env.example` | 5 | `literal-secret-assignment` | explicit marker |
| `d5910b8975108651059f222566d234d39412fb52` | `.env.example` | 10 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `.env.example` | 9 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `.env.example` | 14 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `.env.example` | 56 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `ENV_SETUP.md` | 50 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `ENV_SETUP.md` | 54 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `ENV_SETUP.md` | 87 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `ENV_SETUP.md` | 103 | `literal-secret-assignment` | synthetic Neon host |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `ENV_SETUP.md` | 104 | `literal-secret-assignment` | synthetic Neon host |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `ENV_SETUP.md` | 182 | `private-key` | invalid PEM |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `ENV_SETUP.md` | 182 | `literal-secret-assignment` | invalid PEM |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `PRODUCTION_READINESS.md` | 79 | `private-key` | invalid PEM |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `PRODUCTION_READINESS.md` | 79 | `literal-secret-assignment` | invalid PEM |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `README.md` | 137 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `README.md` | 138 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `STAGING_DEPLOYMENT.md` | 22 | `literal-secret-assignment` | synthetic Neon host |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `STAGING_DEPLOYMENT.md` | 23 | `literal-secret-assignment` | synthetic Neon host |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `STAGING_DEPLOYMENT.md` | 46 | `literal-secret-assignment` | synthetic Neon host |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `STAGING_DEPLOYMENT.md` | 47 | `literal-secret-assignment` | synthetic Neon host |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `STAGING_DEPLOYMENT.md` | 51 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `STAGING_DEPLOYMENT.md` | 52 | `literal-secret-assignment` | explicit marker |
| `3cf9b7c72bd30e16e2b07ef7c89852ce41082c14` | `STAGING_DEPLOYMENT.md` | 53 | `literal-secret-assignment` | explicit marker |

## Verified non-secret provider metadata

The three `R2-ACCOUNT-1` occurrences are standard Cloudflare R2 S3 endpoint
metadata containing an account identifier. Cloudflare documents this endpoint
separately from the Access Key ID and Secret Access Key required for
authentication. These exact three coordinates are therefore classified as
`non-secret-metadata`; no credential value or reusable fingerprint is stored.

Provider evidence:
<https://developers.cloudflare.com/r2/get-started/s3/#2-generate-api-credentials>

The remaining 42 findings are deliberately excluded from the resolved set:
six public database/direct URLs with embedded authentication, eighteen R2
access key ID/secret access key occurrences, six Redis URLs with embedded
authentication, four SMS API keys, two email API keys, and six opaque legacy
JWT/QR values. GitHub repository metadata contains the four immutable CI image
variables but no production provider-secret inventory. Therefore all 42 remain
`active or status unknown` until an authorized operator completes the provider
and production secret-manager comparison.

They are recorded under 11 non-sensitive aliases (`DB-1`, `R2-PAIR-1` through
`R2-PAIR-3`, `REDIS-1`, `REDIS-2`, `SMS-1`, `SMS-2`, `EMAIL-1`,
`JWT-LEGACY-1`, and `QR-HMAC-1`). These aliases group duplicate historical
occurrences without recording the underlying credential value or a reusable
fingerprint.

## Required inventory gate

An operator with secret-manager access must compare the historical credential
identities with the currently configured services without printing either
value. Record only one of these outcomes for each category:

- confirmed example and never accepted by a real service;
- previously active and already revoked, with the revocation date;
- active or status unknown, requiring rotation before release.

### Redacted evidence checklist

| Identity | Findings | Classification | Required non-secret confirmation |
| --- | ---: | --- | --- |
| `DB-1` | 6 | authentication credential in Neon database/direct URLs | Privately map project and role, then provide `never-issued` evidence or the credential rotation/revocation timestamp and change record. |
| `R2-ACCOUNT-1` | 3 | non-secret Cloudflare R2 account endpoint metadata | **Verified** from the provider documentation linked above; no credential-status action. |
| `R2-PAIR-1` | 6 | Cloudflare R2 Access Key ID/Secret Access Key pair | Privately map the provider token, then provide `never-issued` evidence or revocation timestamp and change record. |
| `R2-PAIR-2` | 8 | Cloudflare R2 Access Key ID/Secret Access Key pair | Same Cloudflare token-inventory confirmation; it may share a change record only if the provider inventory proves the same identity. |
| `R2-PAIR-3` | 4 | Cloudflare R2 Access Key ID/Secret Access Key pair | Same Cloudflare token-inventory confirmation; do not infer identity from naming or documentation location. |
| `REDIS-1` | 4 | authentication credential in Redis URLs | Privately identify provider, instance, and user; provide `never-issued` evidence or credential rotation/revocation timestamp and change record. |
| `REDIS-2` | 2 | authentication credential in a Redis URL | Perform an independent Redis inventory match; do not assume it is the same credential as `REDIS-1`. |
| `SMS-1` | 2 | SMS provider API key | Identify provider/account privately and provide key status plus `never-issued` or revocation evidence. |
| `SMS-2` | 2 | SMS provider API key | Perform an independent provider inventory match; do not assume it is the same key as `SMS-1`. |
| `EMAIL-1` | 2 | email provider API key | Identify provider/account privately and provide key status plus `never-issued` or revocation evidence. |
| `JWT-LEGACY-1` | 3 | internal JWT signing secret | Equality-check only inside the secret manager against every accepted key; if previously active, provide replacement rollout, session invalidation/expiry, timestamp, and change record. |
| `QR-HMAC-1` | 3 | internal QR signing secret | Equality-check only against every accepted QR key; if previously active, provide replacement rollout and proof the maximum QR lifetime elapsed. |

For every manual closure, record only `provider`, UTC `verifiedAt`,
`operatorReference`, `changeRecord`, and `evidenceReference`. Do not record a
secret, URL, token, private key, endpoint credential, or reusable fingerprint.

The store-review release is blocked while any category remains `active or
status unknown`.

To close an alias, change only its `classification` in the evidence ledger and
add the non-secret `verifiedAt`, `operatorReference`, `changeRecord`, and
`evidenceReference` fields. `revoked` and `never-issued` records also require
the verified provider name. The ledger schema rejects extra fields; a secret
value, connection string, token, endpoint credential, or reusable fingerprint
must not be added through any permitted metadata field.

## Rotation order

1. Create replacement R2/S3 credentials with the minimum required permissions.
   Deploy and verify them, then revoke the historical credentials.
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
6. Re-run the current-tree and full-history scanners. A history match may remain
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
