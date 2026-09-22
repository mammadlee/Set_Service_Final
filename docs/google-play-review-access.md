# Google Play reviewer access — SET Service

Prepare dedicated, stable reviewer accounts **after** human approval of this candidate. Do not commit real credentials or OTP secrets. The Flutter role selector currently exposes Worker, Company and Admin; therefore provide all three roles unless the public release build is changed to hide Admin before submission. The Admin web panel is a separate surface, but the mobile Admin role remains reviewable.

| Role | Login placeholder | Password placeholder | Required state |
| --- | --- | --- | --- |
| Worker | `<PLAY_REVIEW_WORKER_PHONE>` | `<PLAY_REVIEW_WORKER_PASSWORD>` | Approved, with safe sample assignment and QR/attendance path |
| Company | `<PLAY_REVIEW_COMPANY_PHONE>` | `<PLAY_REVIEW_COMPANY_PASSWORD>` | Approved, with safe sample order/assignment data |
| Admin | `<PLAY_REVIEW_ADMIN_EMAIL>` | `<PLAY_REVIEW_ADMIN_PASSWORD>` | Permission-scoped test Admin or Super Admin, with sample moderation data if needed |

Place the actual credentials only in Play Console **App access** (or the approved secure reviewer handoff), never in this repository. They must remain active throughout review, work from Google's review location, and allow immediate login without registration, inaccessible phone OTP, email verification or expiring setup links. If login has device/risk controls, explicitly document the reviewer-safe path without weakening production security generally. Do not provide access to real personal documents or production secrets in sample content.

Reviewer walkthrough: choose role, sign in, open profile and legal links, Worker assignments/QR scanner, Company orders/QR creation, and Admin moderation/approvals if the mobile Admin role is shipped. The QR check-in path needs an accepted assignment and a valid test kiosk/session; explain any physical QR prerequisite in Play Console instructions. Provide an account-deletion explanation and public deletion-page URL separately; do not ask the reviewer to delete a shared test account.

Pre-submission manual checks: confirm credentials, account approval status, sample data, non-expiration, role permissions, HTTPS API reachability from outside Azerbaijan, and whether Play Console has consumed versionCode 4. Replace placeholders only in Play Console, not in this document.
