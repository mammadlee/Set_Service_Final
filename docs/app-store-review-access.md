# App Store review access — SET Service

SET Service reuses the existing Google Play/local seed-account mechanism. There is no Apple-only authentication bypass, universal password or OTP override. The three accounts are ordinary password-authenticated users whose approved/active state is reconciled by `scripts/seed.ts`; normal registration, OTP and authorization rules remain unchanged.

| Role | Default login identifier | Password secret | Prepared state |
| --- | --- | --- | --- |
| Worker | `+994700000003` | `APPLE_REVIEW_WORKER_PASSWORD` | `worker`, active and `approved` |
| Company | `company@setservice.az` / `+994700000002` | `APPLE_REVIEW_COMPANY_PASSWORD` | `company`, active and `approved` |
| Admin | `ops@setservice.az` / `+994700000101` | `APPLE_REVIEW_ADMIN_PASSWORD` | active restricted `admin`; exact view-only allowlist |

The identifiers are fixed for the Apple review accounts. Configure the three `APPLE_REVIEW_*_PASSWORD` values as separate strong secrets in the authorized deployment secret manager; never place their values in Git, CI logs, screenshots or this document. Production seeding remains disabled unless the operator deliberately enables the existing `ALLOW_PRODUCTION_SEED=true` guard. Re-running the guarded seed reconciles the stored hashes for these exact three accounts only.

Before submission, the authorized operator must configure the three `APPLE_REVIEW_*_PASSWORD` secrets, reconcile the accounts using the existing guarded seed workflow, then run `npm run review-accounts:check` against the intended environment. This read-only check verifies exact phone/email identifiers, roles, active/approved status, bcrypt password matches, password uniqueness against other seeded accounts and the exact restricted Admin permission allowlist without reading or printing passwords. Finally verify all three logins from an external device. Put the resulting identifiers and passwords only in App Store Connect Review Information or an approved secure reviewer channel. Accounts must remain active throughout review, must not be geoblocked, and must not require Apple to receive an OTP. Use only synthetic profile/documents and sample operational data.

The restricted Admin review account has this exact view-only allowlist: `view_dashboard`, `view_workers`, `view_companies`, `view_orders`, `view_assignments`, `view_attendance`, and `view_notifications`. It has no worker/assignment mutation permission, cannot manage Admin accounts, and does not receive `*` super-admin access.

Reviewer login steps:

1. Worker: open the app, choose **İşçi**, choose **Daxil ol**, enter the Worker phone and supplied password, then tap **Daxil ol**. No OTP is requested for an approved password account.
2. Company: return to role selection, choose **Müəssisə**, enter the Company email and supplied password, then tap **Daxil ol**. No registration or OTP is required.
3. Admin: return to role selection and press-and-hold the SET logo in the upper part of the screen to open the intentionally non-public Admin login, enter the Admin email and supplied password, then tap **Daxil ol**. Permission-hidden destructive/system-management functions are intentionally unavailable.

Suggested Review Notes (adapt with actual account details and environment):

1. Open the app and choose Worker or Company normally. For Admin, press-and-hold the upper SET logo; use the corresponding supplied credentials.
2. Worker: Profile → work history/CV and documents → assignments → sample QR/attendance (requires a prepared valid kiosk and accepted assignment) → notifications → ratings/report → Privacy/Terms → Profile → Hesabı sil. Describe the physical QR/test token setup without weakening production validation.
3. Company: approved account → create/view order → assignments and permitted worker profile → rating/report → More → Məxfilik və hesab → Hesabı sil.
4. Admin: inspect the read-only dashboard, worker/company directories, orders, assignments, attendance and notifications. Worker/company approval, moderation and other mutation surfaces are intentionally unavailable to this review account.

The public `/privacy`, `/terms` and `/account-deletion` URLs are accessible without login, but the public deletion form is not a substitute for the in-app deletion controls. Reconfirm their real production HTTP 200 responses before submission.

Do not ask a reviewer to delete one of these shared stable accounts. If deletion must be demonstrated, prepare a separate disposable account. Immediately before submission, manually confirm that sample orders/assignments, any QR kiosk prerequisite and synthetic notification/moderation examples are still current; seed data alone cannot prove the live production dataset is review-ready.
