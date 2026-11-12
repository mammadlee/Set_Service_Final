# Store review release: historical secret response

This runbook records only secret categories and response steps. Never paste a
credential, connection string, private key, account endpoint, or credential
fingerprint into this file, a ticket, CI output, or chat.

## Current audit result

The current working tree passes the scanner's `--current-only` mode. The full
Git history scan also passes and reconciles 99 matches in six ancestor commits
across historical configuration and deployment documents:

- 92 literal sensitive assignments;
- 4 private-key markers;
- 3 R2 account-endpoint markers.

The evidence ledger resolves 90 exact synthetic matches, the 3 exact R2
account-endpoint metadata matches, and 6 matches tied to a provider-verified
revoked R2 credential. No historical finding remains unresolved.

The Firebase-like private-key fragments, cross-provider placeholder groups,
repository-template values, and legacy Quick Start QR value documented below
are verified synthetic examples. Runtime `NO_MATCH` results are supporting
evidence only and are never treated as revocation proof.

## Verified synthetic findings

The 54 entries below are explicit documentation-only synthetic values. Another
18 findings are resolved by the cross-provider placeholder triage below, 15 by
the documentation-placeholder reassessment, and 3 by the QR provenance timeline.
Their exact commit/path/line/rule coordinates are mirrored in
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
- `documentation placeholder`: the literal is confined to setup/example
  material, is structurally generic or explicitly marked as illustrative, is
  rejected or required to be replaced by the repository setup flow, and was
  later replaced by a non-literal secret reference. A private runtime
  `NO_MATCH` result may support but cannot establish this classification alone.

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

## Cross-provider placeholder triage

The following 18 findings are classified as `synthetic`, not `revoked` or
`never-issued`. This classification is based on exact source context and
credential structure without storing or reporting any value, URL, identifier,
hash, or fingerprint:

| Identity | Findings | Non-secret evidence |
| --- | ---: | --- |
| `R2-PAIR-2` | 8 | In `ENV_SETUP.md`, one 15-character scalar is assigned as both access ID and secret in separate generic S3 and Cloudflare R2 examples, and the same scalar is reused for unrelated SMS and email API-key fields. It matches neither the documented AWS S3 20/40 form nor Cloudflare R2's token-ID/SHA-256 derivation. |
| `R2-PAIR-3` | 4 | In the generic object-storage example in `PRODUCTION_READINESS.md`, one 24-character scalar is assigned as both access ID and secret and is also reused as the SMS API-key example. It matches neither provider issuance model. The source does not establish a Cloudflare provider. |
| `SMS-1` | 2 | The generic HTTP SMS example reuses the exact `R2-PAIR-3` documentation scalar; the same document states that provider onboarding and payload mapping are pending. |
| `SMS-2` | 2 | The generic HTTP SMS example reuses the exact `R2-PAIR-2` documentation scalar across six unrelated authentication fields. |
| `EMAIL-1` | 2 | The generic HTTP email example reuses the exact `R2-PAIR-2` documentation scalar across six unrelated authentication fields. |

Primary format evidence:

- Cloudflare documents that an R2 Access Key ID is the API-token ID and the
  Secret Access Key is derived as the SHA-256 hash of the token value:
  <https://developers.cloudflare.com/r2/api/tokens/>.
- AWS documents the S3 account access-key examples as a 20-character access ID
  and a 40-character secret:
  <https://docs.aws.amazon.com/AmazonS3/latest/developerguide/MakingRequests.html#AboutAccessKeys>.

These findings therefore need no provider inventory check. Current production
R2, SMS, and email credentials remain separate deployment secrets and are not
classified or exposed by this triage.

## Verified non-secret provider metadata

The three `R2-ACCOUNT-1` occurrences are standard Cloudflare R2 S3 endpoint
metadata containing an account identifier. Cloudflare documents this endpoint
separately from the Access Key ID and Secret Access Key required for
authentication. These exact three coordinates are therefore classified as
`non-secret-metadata`; no credential value or reusable fingerprint is stored.

Provider evidence:
<https://developers.cloudflare.com/r2/get-started/s3/#2-generate-api-credentials>

## Documentation-placeholder reassessment (2026-11-10)

This review inspected only immutable Git context, example/setup intent, and
sanitized structural properties. It did not record or disclose a credential,
URL, hash, prefix, suffix, or reusable fingerprint. The operator separately
confirmed that live production values are injected through the private VPS
runtime configuration, and private runtime comparisons returned `NO_MATCH`.
Those runtime facts are corroborating evidence, not the sole basis for any
classification.

| Identity | Findings | Sanitized repository evidence | Decision |
| --- | ---: | --- | --- |
| `DB-1` | 6 | The two equal database/direct literals occur only in `.env.example` snapshots. They use a common placeholder password and project-local, single-label example structure. `scripts/setup.sh` copies the template, tells the operator to fill the values, and skips migration while the default database pattern remains. The audited-baseline commit replaces the literal with a non-literal reference. | Synthetic documentation placeholder. |
| `REDIS-1` | 4 | Two unchanged documentation examples are repeated in later Git snapshots. The literal uses an internal single-label host and a generic credential noun, contradicting the same documents' requirement for long, random, non-placeholder production secrets. It was later replaced by a non-literal secret reference. | Synthetic documentation placeholder. |
| `REDIS-2` | 2 | The literal occurs only in the staging example. Its generic password is exactly reused by the unrelated DB template, while the staging checklist explicitly forbids placeholder and reused secrets. It was later replaced by a non-literal secret reference. | Synthetic documentation placeholder. |
| `JWT-LEGACY-1` | 3 | One unchanged README Quick Start literal is inherited by two later snapshots. It was introduced in the initial backend skeleton before deployment files existed, the real `.env` was ignored, and the value carries explicit illustrative/random placeholder semantics. A later audited setup replaces the legacy single-key example with independent secret references. | Synthetic documentation placeholder. |
| `QR-HMAC-1` | 3 | The initial Quick Start literal is different from the official `.env.example` value, is never embedded in source, and is removed before tracked production deployment exists. The setup flow copies `.env.example`, requires operator replacement, and ignores the real `.env`. A later README labels the replacement as a development value; the first production stack consumes a private `.env` and a non-literal reference. | Synthetic development/documentation placeholder. |

The four synthetic decisions describe the checked-in repository literals; they
do not assert provider revocation or `never-issued` lifecycle status. Their
exact finding coordinates remain unchanged in the evidence ledger.

The six `R2-PAIR-1` findings are separately resolved by the provider-backed
revocation record already stored in the ledger. After that record and this
reassessment, all 99 historical findings have an evidence-backed disposition.

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
| `DB-1` | 6 | **Synthetic documentation.** Default `.env.example` database/direct placeholder rejected by the setup flow until replaced. | Repository-context evidence recorded above; no provider lifecycle claim. |
| `R2-ACCOUNT-1` | 3 | non-secret Cloudflare R2 account endpoint metadata | **Verified** from the provider documentation linked above; no credential-status action. |
| `R2-PAIR-1` | 6 | **Revoked.** Provider-backed token identity match and deletion evidence are recorded in the ledger. | No secret material is stored in this document; retain the restricted provider evidence. |
| `R2-PAIR-2` | 8 | **Synthetic documentation.** Cross-provider duplicate and incompatible credential structure. | No provider check for these historical documentation occurrences. |
| `R2-PAIR-3` | 4 | **Synthetic documentation.** Generic object-storage duplicate; Cloudflare attribution was unsupported. | No provider check for these historical documentation occurrences. |
| `REDIS-1` | 4 | **Synthetic documentation.** Generic internal Redis example contradicts the same documentation's non-placeholder production requirement. | Repository-context evidence recorded above; no provider lifecycle claim. |
| `REDIS-2` | 2 | **Synthetic documentation.** Staging example reuses the unrelated DB template password despite an explicit no-reuse checklist. | Repository-context evidence recorded above; no provider lifecycle claim. |
| `SMS-1` | 2 | **Synthetic documentation.** Exact cross-provider duplicate described above. | No provider check for these historical documentation occurrences. |
| `SMS-2` | 2 | **Synthetic documentation.** Exact six-field duplicate described above. | No provider check for these historical documentation occurrences. |
| `EMAIL-1` | 2 | **Synthetic documentation.** Exact six-field duplicate described above. | No provider check for these historical documentation occurrences. |
| `JWT-LEGACY-1` | 3 | **Synthetic documentation.** Initial-skeleton README value has explicit illustrative placeholder semantics and no deployment-file use. | Repository-context evidence recorded above; no provider lifecycle claim. |
| `QR-HMAC-1` | 3 | **Synthetic documentation.** Initial Quick Start value predates tracked deployment, is separate from the setup template, and is replaced by an explicitly labeled development value before the production stack appears. | Git provenance timeline recorded below; no provider lifecycle claim. |

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

## QR-HMAC-1 provenance timeline (2026-11-10)

The exact literal is not reproduced, hashed, fingerprinted, or otherwise stored
in this evidence record.

- On 2026-05-08, `d5910b8975108651059f222566d234d39412fb52`
  introduced the initial backend skeleton and a README Quick Start example. The
  QR generator/validator already read `process.env.QR_HMAC_SECRET`, but the
  README literal was not embedded in source code.
- The README literal differed from the same commit's `.env.example` value. The
  supported setup path copied `.env.example` to the ignored `.env` file and
  explicitly required the operator to fill `QR_HMAC_SECRET`; it did not source
  the README literal.
- The two later findings are unchanged README snapshots, not separate key
  issuance events.
- On 2026-07-07, `c902a5a6fb2a11a60e2854f5ab34e953130c58e0`
  replaced the initial literal with a different value under the explicit
  heading `Minimum development values`.
- On 2026-08-13, `d8031bb5d31240a477a540a940c1f1b5fd350d5f`
  introduced the first tracked secure VPS production stack. It loaded a private
  environment file and used a non-literal production secret reference; neither
  its Compose file nor deployment script contained the initial README literal.
- The authorized operator separately configured the real production value in
  the private VPS environment, and the restricted runtime comparison returned
  `NO_MATCH`. This supports the Git provenance but is not treated as revocation
  evidence by itself.

Taken together, the repository history establishes the checked-in literal as a
development/documentation example. The classification is `synthetic`; it makes
no claim that a provider revoked it or that it was `never-issued`.

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
