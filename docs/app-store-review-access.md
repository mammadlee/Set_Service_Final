# App Store Connect review access — SET Service

Use this text for App Store Connect **App Review Information** and TestFlight **Beta App Review Information**. Live identifiers and passwords must be copied from the approved secret handoff directly into App Store Connect. They must never be added to this file, source control, CI output, screenshots, tickets, or chat logs.

## Sign-in required

Yes. The application has three reviewable roles. The same three accounts are used for Apple and Google review.

| Role | Username field | Password field | Prepared access |
| --- | --- | --- | --- |
| Worker | `<WORKER_PHONE_FROM_SECRET_MANAGER>` | `<WORKER_PASSWORD_FROM_SECRET_MANAGER>` | Approved synthetic worker with a complete profile, sample private documents, assignments, attendance history, and in-app notifications |
| Company | `<COMPANY_EMAIL_FROM_SECRET_MANAGER>` | `<COMPANY_PASSWORD_FROM_SECRET_MANAGER>` | Approved synthetic company with sample orders and permission to create and inspect its own orders |
| Admin | `<ADMIN_EMAIL_FROM_SECRET_MANAGER>` | `<ADMIN_PASSWORD_FROM_SECRET_MANAGER>` | Restricted review Admin with read-only access to review-cohort workers, companies, orders, assignments, attendance, and notifications |

These accounts use the normal password authentication endpoints. Worker signs in with phone and password. Company and Admin sign in with email and password. No login OTP, registration, email verification, invitation, or expiring setup link is required. SET Service does not use a universal OTP, master password, or reviewer authentication bypass.

The Admin account is not a Super Admin. It cannot manage Admin users, production security settings, moderation, kiosks, permissions, or other production data. Review data is synthetic and isolated from ordinary production accounts. Sensitive documents remain in private object storage and are delivered only through authenticated, short-lived download URLs.

## Reviewer sign-in steps

On a fresh installation or after app data has been cleared, the Worker and Company paths first show the legal-consent gate. Tick the consent checkbox, then tap **Qəbul et və davam et** (Accept and continue). The restricted Admin path does not show this gate.

1. **Worker:** On the role screen choose **İşçi** (Worker). If the legal-consent gate appears, tick its checkbox and tap **Qəbul et və davam et**. Choose **Daxil ol** (Sign in), enter the supplied Worker phone number and password, then tap **Daxil ol**.
2. **Company:** Return to the role screen and choose **Müəssisə** (Company). If the legal-consent gate appears, tick its checkbox and tap **Qəbul et və davam et**. Enter the supplied Company email and password, then tap **Daxil ol**.
3. **Admin:** Return to the role screen. No legal-consent gate is required for this path. Press and hold the large SET logo in the upper part of the screen to open the restricted Admin sign-in. Enter the supplied Admin email and password, then tap **Daxil ol**.

If a reviewer signs in to the wrong role, the app rejects the session and asks them to use the matching role. The reviewer accounts are intentionally protected from account deletion, phone/email replacement, and password-reset flows so the shared credentials remain stable during review.

## Main review paths

### Worker

1. Sign in as Worker.
2. Open **Profile** and inspect the completed synthetic profile, profile image, work history, and test documents.
3. Open **Assignments** to see current and completed synthetic examples.
4. Open attendance history to inspect check-in, check-out, and recorded duration.
5. Open **Notifications** to inspect in-app sample notifications.
6. The QR scanner can be opened normally. A live scan requires a second screen showing a short-lived QR from the prepared review kiosk; no permanent QR or reusable token is used.

### Company

1. Sign in as Company.
2. Inspect the completed synthetic company profile and sample orders.
3. Open an order to inspect status and assignment information.
4. Create a clearly labelled test order if desired. Review-company actions remain in the review cohort and do not send SMS, email, or push notifications to ordinary production users.

### Restricted Admin

1. Use the SET-logo long press described above and sign in as Admin.
2. Inspect the dashboard and the review Worker and Company records.
3. Inspect sample orders, assignments, and attendance records.
4. Confirm that mutation, moderation, Super Admin, permission-management, and production-security surfaces are unavailable.

Do not delete a shared review account or replace its login details. If Apple requires a destructive account-deletion demonstration, the operator must provision a separate disposable synthetic account and provide it through App Store Connect.

## Beta App Review Notes

Copy the following text and replace all six credential placeholders (three credential pairs) and the support-contact placeholder in App Store Connect:

> SET Service is a workforce-management application with Worker, Company, and restricted Admin roles.
>
> Worker phone: `<WORKER_PHONE_FROM_SECRET_MANAGER>`<br>
> Worker password: `<WORKER_PASSWORD_FROM_SECRET_MANAGER>`<br>
> Company email: `<COMPANY_EMAIL_FROM_SECRET_MANAGER>`<br>
> Company password: `<COMPANY_PASSWORD_FROM_SECRET_MANAGER>`<br>
> Admin email: `<ADMIN_EMAIL_FROM_SECRET_MANAGER>`<br>
> Admin password: `<ADMIN_PASSWORD_FROM_SECRET_MANAGER>`
>
> Worker and Company can be selected on the first screen. On a fresh installation, tick the legal-consent checkbox and tap **Qəbul et və davam et** before signing in as Worker or Company. To open the Admin sign-in, press and hold the large SET logo in the upper part of the first screen; the Admin path has no legal-consent gate. Worker uses phone plus password; Company and Admin use email plus password. Login does not require OTP for these approved review accounts. All displayed review data is synthetic. The restricted Admin can see only the isolated review cohort and has no Super Admin or production-security access. The Worker account contains sample assignments, attendance, notifications, and synthetic documents. The Company account contains sample orders and can create a review-only test order. A live QR attendance scan needs a second screen with the prepared review kiosk because QR tokens are short-lived and rotating; attendance history can be reviewed without that optional physical step. Please do not change credentials or delete these shared accounts during review. Support contact: `<APP_REVIEW_CONTACT_FROM_APP_STORE_CONNECT>`.

## Operator pre-submission gate

The authorized operator must deploy the reviewed backend and forward-only migration before creating the accounts. Account reconciliation is a separate, explicitly approved operation:

```text
npm run store-review:plan
npm run store-review:apply
npm run store-review:check
```

Between apply and check, upload the synthetic avatar, health certificate, and criminal-record certificate through the normal authenticated Worker upload flow so the existing R2 and malware-scanning controls remain in force. The plan and readiness commands must remain redacted. After the check passes, manually sign in to all three roles from an external iOS device, confirm API availability at `https://api.setservice.az/v1`, confirm the sample date windows are current, and place credentials only in App Store Connect. Keep the accounts active for the full review period and deactivate or rotate them after the review window under a separate approved operation.
