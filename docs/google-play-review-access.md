# Google Play Console app access — SET Service

Use this text in Google Play Console **Policy and programs → App content → App access**. Select that all or some functionality is restricted and add the instructions below. Live identifiers and passwords must be copied from the approved secret handoff directly into Play Console. They must never be added to this file, source control, CI output, screenshots, tickets, or chat logs.

## Access credentials

The same three accounts are supplied to Apple App Review and Google Play review.

| Role | Username field | Password field | Access |
| --- | --- | --- | --- |
| Worker | `<WORKER_PHONE_FROM_SECRET_MANAGER>` | `<WORKER_PASSWORD_FROM_SECRET_MANAGER>` | Approved synthetic worker with profile, assignments, attendance, notifications, and test documents |
| Company | `<COMPANY_EMAIL_FROM_SECRET_MANAGER>` | `<COMPANY_PASSWORD_FROM_SECRET_MANAGER>` | Approved synthetic company with sample orders and review-only order creation |
| Admin | `<ADMIN_EMAIL_FROM_SECRET_MANAGER>` | `<ADMIN_PASSWORD_FROM_SECRET_MANAGER>` | Least-privilege Admin limited to isolated review data |

Worker uses phone and password. Company and Admin use email and password. These approved accounts do not require login OTP, SMS reception, registration, email verification, invitation acceptance, or an expiring link. There is no global OTP, master password, or authentication bypass. Normal-user OTP and account-security controls remain unchanged.

## App access instructions

1. Launch SET Service.
2. For **Worker**, choose **İşçi**, choose **Daxil ol**, and enter the supplied Worker phone and password.
3. For **Company**, return to the role screen, choose **Müəssisə**, and enter the supplied Company email and password.
4. For **Admin**, return to the role screen and press and hold the large SET logo in the upper part of the screen. Enter the supplied Admin email and password.
5. If the wrong role is selected, return to the first screen and choose the matching role.

## Suggested review steps

### Worker

- Inspect the completed synthetic profile, profile image, work history, and test documents.
- Inspect current and completed assignments.
- Inspect attendance check-in/check-out history and recorded duration.
- Inspect in-app notifications.
- Open the QR scanner. A live scan is optional and requires a second screen showing the prepared review kiosk because its QR token is short-lived and rotating.

### Company

- Inspect the synthetic company profile and sample orders.
- Open an order and inspect its status and assignment information.
- Create a clearly labelled test order if desired. This review-cohort action does not contact ordinary production users or trigger external SMS, email, or push delivery to them.

### Restricted Admin

- Inspect the dashboard, review Worker and Company records, orders, assignments, attendance, and in-app notifications.
- The account is deliberately read-only and cannot access Super Admin, Admin management, production security settings, moderation, or real customer data.

The shared review accounts are protected from account deletion, credential replacement, and password-reset flows during review. Do not ask the reviewer to delete them. If Google requires a destructive deletion demonstration, prepare a separately approved disposable synthetic account.

## Text for the Play Console instruction field

> SET Service has Worker, Company, and restricted Admin roles. Select Worker or Company on the first screen. To open Admin sign-in, press and hold the large SET logo near the top of the first screen. Worker signs in with phone and password; Company and Admin sign in with email and password. The supplied approved review accounts do not require OTP or SMS access. All review content is synthetic and isolated from ordinary production data. Worker includes sample assignments, attendance, notifications, and test documents. Company includes sample orders and review-only order creation. Admin is read-only and limited to the review cohort. Live QR attendance is optional and requires a second screen with the prepared rotating-QR kiosk. Please do not change the credentials or delete these shared accounts.

Before submission, the authorized operator must run the redacted read-only readiness check, sign in to every role on an external Android device, confirm API availability at `https://api.setservice.az/v1`, and verify that the Android application ID is `az.setservice.app`. Put the live credentials only in Play Console. Keep them active for the full review period, then deactivate or rotate them through a separately approved operation.
