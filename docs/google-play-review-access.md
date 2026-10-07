# Google Play reviewer access — SET Service

Use the same approved seed-backed review accounts documented for App Store review. Do not create a store-specific auth bypass and do not commit real passwords or OTP secrets. The Flutter role selector currently exposes Worker, Company and Admin; therefore provide all three roles unless the public release build is changed to hide Admin before submission. The Admin web panel is a separate surface, but the mobile Admin role remains reviewable.

| Role | Login placeholder | Password placeholder | Required state |
| --- | --- | --- | --- |
| Worker | `+994700000003` | `APPLE_REVIEW_WORKER_PASSWORD` | Approved, with safe sample assignment and QR/attendance path |
| Company | `company@setservice.az` / `+994700000002` | `APPLE_REVIEW_COMPANY_PASSWORD` | Approved, with safe sample order/assignment data |
| Admin | `ops@setservice.az` / `+994700000101` | `APPLE_REVIEW_ADMIN_PASSWORD` | Least-privilege view-only Operations Admin; exact allowlist, no wildcard or Admin-management permission |

Place the actual credentials only in Play Console **App access** (or the approved secure reviewer handoff), never in this repository. Configure the three `APPLE_REVIEW_*_PASSWORD` values in the deployment secret manager, reconcile through the existing guarded seed workflow, and run the read-only `npm run review-accounts:check` preflight. They must remain active throughout review, work from Google's review location, and allow immediate password login without registration, inaccessible phone OTP, email verification or expiring setup links. If login has device/risk controls, explicitly document the reviewer-safe path without weakening production security generally. Do not provide access to real personal documents or production secrets in sample content.

Reviewer walkthrough: choose Worker or Company normally; open Admin by pressing and holding the upper SET logo on the role screen. Sign in, open profile and legal links, Worker assignments/QR scanner, Company orders/QR creation, and the Admin read-only dashboard/directories/orders/assignments/attendance/notifications. Approval, moderation and other mutation surfaces are intentionally unavailable to this review account. The QR check-in path needs an accepted assignment and a valid test kiosk/session; explain any physical QR prerequisite in Play Console instructions. Provide an account-deletion explanation and public deletion-page URL separately; do not ask the reviewer to delete a shared test account.

Pre-submission manual checks: confirm credentials, account approval status, sample data, non-expiration, role permissions, HTTPS API reachability from outside Azerbaijan, and that the candidate's versionCode is still unused in Play Console. Put live passwords only in Play Console, not in this document.
