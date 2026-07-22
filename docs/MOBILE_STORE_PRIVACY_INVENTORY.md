# SET Service mobile privacy inventory

This is a technical inventory for the Google Play Data Safety form, the App
Store privacy questionnaire, and the public privacy policy. It is not legal
text. Product/legal owners must approve the final wording, retention periods,
processor list, lawful basis, and support contact before store submission.

## Technical scope

- Mobile roles: worker, company, and admin.
- API identity: role-scoped access and refresh tokens.
- Notifications: Firebase Cloud Messaging/APNs device tokens.
- Sensitive files: identity, passport, health, criminal-record, profile, and
  other verification documents stored as private object keys and delivered by
  short-lived authorized download URLs.
- The app declares no advertising or cross-app tracking.

## Data inventory

| Data | Source | Purpose | Linked to account | Storage/processor | Retention decision |
| --- | --- | --- | --- | --- | --- |
| Name and profile details | User/company/admin | Account, staffing, verification | Yes | PostgreSQL/API | **TBD by owner** |
| Phone number | Worker/company | Login, OTP, account recovery, operational contact | Yes | PostgreSQL, configured SMS processor | **TBD by owner** |
| Email address | Company/admin/optional worker | Login, OTP/recovery, operational contact | Yes | PostgreSQL, configured email processor | **TBD by owner** |
| Password hash and session metadata | User authentication | Authentication and session security | Yes | PostgreSQL/Redis; plaintext password is not stored | Session/token TTL plus **TBD account retention** |
| Device/push token | Signed-in device | Assignment, approval, and operational notifications | Yes | PostgreSQL and Firebase/APNs | Remove/revoke on logout and account deletion; stale-token cleanup **TBD** |
| Job skills, languages, experience, class, ratings | Worker/admin | Matching, assignment, quality management | Yes | PostgreSQL/API | **TBD by owner** |
| Company, order, assignment, venue, and schedule data | Company/admin | Create and fulfil staffing orders | Yes | PostgreSQL/API | **TBD by owner** |
| Attendance and QR events | Worker/company/admin | Entry/exit confirmation, reporting, fraud prevention | Yes | PostgreSQL/API | **TBD by owner** |
| Profile photo and user-provided files | Worker | Profile and verification | Yes | Private object storage plus metadata in PostgreSQL | **TBD by document type** |
| Identity/passport document | Worker | Identity verification | Yes; sensitive | Private object storage, authorized admin access | **TBD by owner/legal** |
| Health document | Worker | Role/fitness verification where required | Yes; health/sensitive | Private object storage, authorized admin access | **TBD by owner/legal** |
| Criminal-record/other verification document | Worker | Eligibility verification | Yes; sensitive | Private object storage, authorized admin access | **TBD by owner/legal** |
| IP, request ID, actor/role, security and audit events | API/device | Security, abuse prevention, support, audit | Usually linked/pseudonymous | Structured API/audit logs and monitoring processors | **TBD security-log retention** |
| Crash/performance diagnostics | App/platform if enabled | Reliability and support | Configuration-dependent | Apple/Google/Firebase diagnostics as configured | Confirm in release console; **TBD** |

The application does not require GPS permission. Venue/address values entered
for orders are business content, not device-derived precise location.

## Sharing and access boundaries

- Workers access their own profile, assignments, attendance, and documents.
- Companies access order/assignment data and only worker information authorized
  by an order, assignment, or attendance relationship.
- Admin access is permission-controlled and sensitive document access is
  audited.
- Infrastructure processors can include the database host, private object
  storage provider, Firebase/APNs, SMS/email providers, and monitoring host.
  The production owner must list the actual legal entity and country/region for
  every configured processor.
- Data is not declared as sold and is not used for advertising/tracking unless a
  later release adds such behavior and updates code, manifests, policy, and
  store declarations together.

## Deletion contract required before store submission

The final product flow must provide:

1. An authenticated in-app account deletion request for worker and company
   accounts, with re-authentication for the destructive action.
2. Immediate session and device-token revocation.
3. A deletion state visible to the requester and an idempotent API response.
4. Deletion or irreversible anonymization of profile and business data, except
   records that must be retained under an approved retention rule.
5. Deletion of private objects and their metadata, including replacement/orphan
   cleanup.
6. Audit evidence containing no document contents or reusable credentials.
7. A documented completion SLA and support/escalation path.
8. A public web deletion-request URL if required by Google Play.

Current retention exceptions must never be invented in UI copy. The owner/legal
team must approve them and the backend must enforce the same policy.

## Google Play Data Safety mapping

Use this as the technical starting point and verify it against the release
configuration:

- Personal info: name, email, phone, user IDs, profile details.
- Photos and videos: profile image and image-based documents.
- Files and docs: identity, health, criminal-record, passport, and other
  verification files.
- Health and fitness: health document content, if collected.
- App activity: orders, assignments, attendance, QR activity, and app
  interactions used for core functionality/security.
- Device or other IDs: FCM/APNs device token and installation identifiers used
  for notifications.
- Diagnostics: crash/performance data only when the production build enables a
  diagnostics processor.
- Security practices: TLS in transit; private sensitive-file storage;
  authenticated, object-level access; account deletion availability must be
  confirmed before submission.

For each selected category, the expected purposes are **App functionality**,
**Account management**, and where applicable **Fraud prevention, security and
compliance**. Mark data as required/optional from the actual screen and backend
validation, not from this document alone.

## App Store privacy-label mapping

The app-level `PrivacyInfo.xcprivacy` declares no tracking and lists the core
linked data classes used for app functionality:

- Contact info: name, email address, phone number.
- Identifiers: user ID and device/push identifier.
- User content: photos/videos, documents, and other user-provided content.
- Sensitive information: identity and verification content.

Review Firebase, file picker, scanner, secure storage, and every other packaged
SDK privacy manifest during the Xcode archive privacy report. Add diagnostics or
other categories to the App Store questionnaire if the production SDK/config
collects them.

## Store-submission fields that must be supplied

- Public privacy-policy URL: **TBD**
- Support email/phone/URL: **TBD**
- Account-deletion web URL: **TBD**
- Data controller legal name/address: **TBD**
- Approved retention schedule by data type: **TBD**
- Processor/subprocessor list and regions: **TBD**
- Child/minimum-age policy: **TBD**
- User consent/notice version and effective date: **TBD**
- Cross-border transfer and regulatory wording: **TBD by legal**
