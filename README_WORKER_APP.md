# SET Service Worker Mobile App

This is the Flutter Worker app integration for the existing SET Service backend MVP.

The backend MVP is already working and smoke-tested:

Auth -> Worker Approval -> Company Order -> Admin Assignment -> Worker Accept -> QR Check-in/out.

The mobile app uses the existing Swagger/OpenAPI backend contract. Backend APIs were not redesigned or changed for this client.

## Location

```text
apps/worker_app
```

## Stack

- Flutter
- Dio HTTP client
- Flutter Secure Storage
- Provider/ChangeNotifier
- Feature-first clean architecture
- Repository pattern
- Environment config through `--dart-define=BASE_URL=...`
- Firebase Messaging integration for Worker, Company, and Admin push tokens

## Implemented MVP Screens

- Splash screen
- Worker login
- Worker registration
- OTP verification for registration
- Password creation after registration OTP
- Pending approval screen
- Rejected/suspended/inactive account blocked screen
- Worker dashboard
- Worker profile (`Profilim`) with profile photo, skills, languages, work history, rating summary, and documents
- Assignment list
- Assignment detail, including assigned category/role for multi-category orders
- Assignment accept/reject
- Attendance check-in/check-out with camera QR scan and manual QR token fallback
- Notifications list
- Logout

## Architecture

```text
apps/worker_app/lib/
  core/
    config/
    network/
    router/
    storage/
    theme/
  features/
    auth/
    worker/
    dashboard/
    assignments/
    attendance/
    notifications/
    home/
  shared/
    widgets/
```

Important files:

```text
lib/main.dart
lib/core/network/api_client.dart
lib/core/router/app_routes.dart
lib/core/storage/secure_token_storage.dart
lib/features/auth/data/auth_repository.dart
lib/features/assignments/data/assignment_repository.dart
lib/features/attendance/data/attendance_repository.dart
lib/features/notifications/data/notification_repository.dart
lib/features/home/presentation/screens/worker_home_shell.dart
```

## Backend Setup

From the repo root:

```bash
npx prisma migrate dev
npm run db:seed
npm run dev
```

Default backend URLs:

```text
Health:  http://localhost:3000/health
API:     http://localhost:3000/v1
Swagger: http://localhost:3000/docs
```

## Run Worker App

From the Flutter app folder:

```bash
cd apps/worker_app
flutter pub get
flutter run --dart-define=BASE_URL=http://localhost:3000
```

Android emulator:

```bash
flutter run --dart-define=BASE_URL=http://10.0.2.2:3000
```

Web:

```bash
flutter run -d chrome --dart-define=BASE_URL=http://localhost:3000
```

## Change API Base URL

Use `BASE_URL` at build/run time:

```bash
flutter run --dart-define=BASE_URL=https://api.example.com
```

The app automatically appends `/v1` unless the provided URL already ends with `/v1`.

## Firebase Push Notifications

The app can build locally without Firebase config files. If Firebase is not configured, push registration is skipped and the app continues to use in-app notifications.

Android setup for real push delivery:

- Create a Firebase Android app with package `az.setservice.worker_app`.
- Place `google-services.json` under `apps/worker_app/android/app/`.
- Keep `android.permission.POST_NOTIFICATIONS` enabled for Android 13+.
- Android minimum SDK is 23 because `firebase_messaging` requires it.
- Run the app normally; after login the app calls `POST /v1/auth/fcm-token`.

iOS setup for real push delivery:

- Create a Firebase iOS app with the Runner bundle identifier.
- Add `GoogleService-Info.plist` to `ios/Runner` through Xcode.
- Enable Push Notifications and Background Modes in Xcode.
- Configure APNs key/certificate in Firebase.
- iOS permission is requested at runtime in Azerbaijani system UI.

Logout calls `DELETE /v1/auth/fcm-token` for the active role before local auth-token cleanup. The Firebase installation token is not deleted during single-role logout, so another stored role session on the same device is not disrupted.

## Test Login/Register Flow

Development backend OTP usually uses:

```text
123456
```

Backend `.env` should include:

```env
OTP_TEST_MODE="true"
OTP_TEST_CODE="123456"
```

Manual test steps:

1. Open app.
2. Tap `Create worker account`.
3. Register with a unique E.164 phone number, for example `+994551234567`.
4. Enter OTP `123456` and create a password.
5. App shows pending approval.
6. Log in as admin from Postman/backend and approve the worker.
7. Return to app and log in with the worker phone + password.
8. App opens dashboard.
9. Create an order as company from Postman/backend.
10. Assign the worker as super admin.
11. Refresh assignments in the app.
12. Open assignment detail and accept it.
13. Generate attendance QR token from company/admin API.
14. Tap `QR oxut` in the attendance panel and scan the displayed QR code.
15. If the camera is unavailable, paste the QR token manually.
16. Check in.
17. Check out.

## API Endpoints Used

Auth:

- `POST /v1/auth/worker/register`
- `POST /v1/auth/worker/complete-registration`
- `POST /v1/auth/worker/login`
- `POST /v1/auth/worker/forgot-password`
- `POST /v1/auth/worker/reset-password`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `POST /v1/auth/fcm-token`
- `DELETE /v1/auth/fcm-token`

Worker:

- `GET /v1/workers/me`
- `PATCH /v1/workers/me`
- `POST /v1/workers/me/profile-photo`
- `POST /v1/workers/me/documents`

Assignments:

- `GET /v1/assignments`
- `GET /v1/assignments/:id`
- `PATCH /v1/assignments/:id/accept`
- `PATCH /v1/assignments/:id/reject`

Attendance:

- `GET /v1/attendance`
- `POST /v1/attendance/check-in`
- `POST /v1/attendance/check-out`

Notifications:

- `GET /v1/notifications`
- `PATCH /v1/notifications/:id/read`
- `PATCH /v1/notifications/read-all`

## Error Handling

Backend error messages and codes are shown clearly in the UI.

Attendance-specific codes handled:

- `ASSIGNMENT_NOT_ACCEPTED`
- `ATTENDANCE_ALREADY_CHECKED_IN`
- `ATTENDANCE_ALREADY_COMPLETED`
- `QR_TOKEN_INVALID`
- `QR_TOKEN_EXPIRED`

Account state handling:

- `pending_approval` blocks app access with pending approval UI.
- `rejected`, `suspended`, and `inactive` show blocked account UI.
- Approved workers can access dashboard, assignments, and attendance.

## Validation Commands

```bash
cd apps/worker_app
flutter analyze
flutter test
flutter build apk --debug --dart-define=BASE_URL=http://10.0.2.2:3000
```

## Known MVP Client Limitations

- QR camera scanning is implemented with manual QR token input kept as the fallback.
- Android requires `android.permission.CAMERA`; iOS requires `NSCameraUsageDescription` in `ios/Runner/Info.plist`.
- Push notifications require Firebase project files for real delivery; local builds safely skip push when those files are absent.
- Offline mode is not implemented.
- Admin mobile mode is intentionally simplified and is not a full replacement for the web admin panel.
- No fake data is used by the app; all screens call real backend endpoints.
