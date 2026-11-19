# SET Service — cross-store privacy consistency gate

Status: release-review checklist, **not** proof that either store form has been filed. Compare one specific signed Android artifact and one specific signed iOS archive from the same intended version. The current candidate is `1.0.0+4`; source/configuration checks must be repeated for the packaged binaries and deployed API. Apple and Google use different category definitions, so matching answers does **not** mean copying the wording or checkboxes verbatim.

| Real data flow | Google Play Data Safety review | Apple App Privacy review | Code/policy consistency gate |
| --- | --- | --- | --- |
| Worker/Company name, phone, role-dependent email and account IDs | Personal info; required/optional per flow | Contact Info and User ID; usually linked | Registration, profile, auth and `/privacy` must describe the same collection and purpose. |
| Worker health certificate for approval | Health/fitness plus files/docs as applicable | Health (user-provided health/medical data), possibly Other User Content for document treatment | Never mark health data absent because the app is not a health product. Check private access and retention. |
| Criminal-record certificate, optional CV and other documents | Files/docs; consider sensitive personal-data treatment | Other User Content; Sensitive Info only where Apple's definition applies | Verify authorization and no public document URL. Preserve optional CV versus mandatory approval certificates. |
| Profile photo | Photos/videos | Photos or Videos | Check constrained public-photo route and policy visibility statement; do not imply all private files are public. |
| Orders, work history, ratings, notes and attendance | App activity/user-generated content, with role-specific operational purposes | Other User Content and, only if actual SDK collection supports it, Usage Data | Do not describe QR-scanner camera frames as media uploads; attendance payload and timestamps are collected. |
| Pay rate in an order | Financial-info classification requires owner review | Other Financial Info only if it represents identifiable salary/income under Apple's taxonomy | No payment card/bank/IAP flow evidenced; do not mark Payment Info collected merely because an order has a rate. |
| FCM/APNs registration token and installation identity | Device or other IDs | Device ID if it meets Apple's device-level identifier definition | Confirm push-enabled production configuration and deletion/logout token cleanup. No advertising ID is evidenced in checked source. |
| IP, request/audit logs and crash/performance data | App activity/diagnostics as applicable | Apple's IP guidance may imply location/device ID/diagnostics according to use; diagnostics require packaged SDK audit | Inspect production log retention and Firebase/transitive SDK behavior; direct `pubspec.yaml` dependencies alone cannot prove “none”. |
| GPS, tracking and advertising | Checked Android source/merged local manifest has no fine/coarse location or AD_ID; recheck release | Checked iOS source has no device-GPS use or tracking purpose; recheck archive/SDK report | Business-entered venue text is not device GPS. “No Tracking” requires actual cross-company data-use audit. |
| Account deletion and retention | In-app deletion plus public request URL for Play | In-app deletion initiation for account-creating app; public page alone is insufficient | Test Worker and Company actions, auth/session revocation, object cleanup and documented legal/audit exceptions. |

Use `docs/google-play-data-safety.md` as the Android engineering inventory and `docs/app-store-privacy.md` as the Apple taxonomy draft. The [Apple category definitions](https://developer.apple.com/app-store/app-privacy-details/) and [App Store Connect disclosure instructions](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy) are the primary references for iOS answers. Treat `docs/MOBILE_STORE_PRIVACY_INVENTORY.md` as historical planning material where it conflicts with current code. Do not copy a Google Play “shared” answer directly into Apple's “Tracking” field, or infer an Apple Health category solely from whether HealthKit is integrated.

## Release gate

Before human submission, record the exact artifact hashes/build numbers and have product/legal plus engineering compare:

1. Final Android merged manifest and SDK report; final iOS privacy report, `PrivacyInfo.xcprivacy`, entitlement/permission strings and packaged pods.
2. Live `/privacy`, `/terms` and `/account-deletion` text against both apps' in-app links and actual Worker/Company behavior.
3. Data collection, access, purpose, retention and deletion exceptions by role, including health and criminal documents.
4. Production FCM/APNs and diagnostics/logging configuration, processors and any cross-border transfers.
5. Final Google Play Data Safety and App Store Connect App Privacy answers, with a named human approver and date.

If any code, SDK, backend data flow, policy or processor changes after sign-off, redo the affected classification. Neither store declaration is considered complete from a repository document alone.
