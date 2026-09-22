# App Store review access — SET Service

Human/account-holder action before submission. Do not put real credentials, OTP bypass codes or personal documents in Git. The iOS Flutter binary currently exposes Worker, Company and Admin role selection, so prepare all three review paths unless the final binary changes.

| Role | Review credential placeholder | Prepared state |
| --- | --- | --- |
| Worker | `<IOS_REVIEW_WORKER_LOGIN>` / `<IOS_REVIEW_WORKER_PASSWORD>` | Approved, safe sample profile, accepted assignment, ratings/notification examples; health/criminal documents must be synthetic and access-controlled |
| Company | `<IOS_REVIEW_COMPANY_LOGIN>` / `<IOS_REVIEW_COMPANY_PASSWORD>` | Approved, safe sample order and assignment; can view only the permitted worker profile/document fields |
| Admin | `<IOS_REVIEW_ADMIN_LOGIN>` / `<IOS_REVIEW_ADMIN_PASSWORD>` | Least-privilege account with reviewable approval/moderation examples if Admin remains in the submitted binary |

Place live credentials in App Store Connect Review Information or an approved secure reviewer channel only. Accounts must not expire during review, require Apple to own a phone number, require contacting SET Service, rely on inaccessible OTP, or be geoblocked. Verify from an external network and re-check immediately before submission. Do not have a reviewer delete a shared test account: provide a disposable deletion-test account or an explained safe test path.

Suggested Review Notes (adapt with actual account details and environment):

1. Open app and choose Worker, Company or Admin at the role selector; use the corresponding supplied credentials.
2. Worker: Profile → work history/CV and documents → assignments → sample QR/attendance (requires a prepared valid kiosk and accepted assignment) → notifications → ratings/report → Privacy/Terms → Profile → Hesabı sil. Describe the physical QR/test token setup without weakening production validation.
3. Company: approved account → create/view order → assignments and permitted worker profile → rating/report → More → Məxfilik və hesab → Hesabı sil.
4. Admin: explain role permissions and sample moderation/approvals if shipped; otherwise remove Admin from the review instructions only after confirming it is absent from the submitted binary.

The public `/privacy`, `/terms` and `/account-deletion` URLs are accessible without login, but the public deletion form is not a substitute for the in-app deletion controls. Reconfirm their real production HTTP 200 responses before submission.
