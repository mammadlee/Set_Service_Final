# SET Service Worker App

Flutter mobile client for the SET Service Worker MVP. The app uses the existing backend OpenAPI contract and does not contain fake backend logic or hardcoded business data.

## Stack

- Flutter
- Feature-first folders
- Provider for app state
- Dio HTTP client
- Flutter Secure Storage for access/refresh tokens
- Repository pattern for API access
- Centralized Azerbaijani UX strings in `lib/shared/app_strings.dart`

## Backend Configuration

The app reads the backend base URL from a Dart define:

```bash
flutter run --dart-define=BASE_URL=http://localhost:3000
```

`AppConfig` automatically appends `/v1`, so both of these are valid:

```bash
--dart-define=BASE_URL=http://localhost:3000
--dart-define=BASE_URL=http://localhost:3000/v1
```

For Android emulator local backend access, use:

```bash
flutter run --dart-define=BASE_URL=http://10.0.2.2:3000
```

For a physical phone on the same Wi-Fi as your development machine, use your machine LAN IP:

```bash
flutter run --dart-define=BASE_URL=http://YOUR_LAN_IP:3000
```

For production builds, always provide the public API URL:

```bash
flutter build apk --release --dart-define=BASE_URL=https://api.yourdomain.com
```

Release builds intentionally refuse to run with a missing `BASE_URL`, `localhost`, `127.0.0.1`, or Android emulator-only `10.0.2.2` value.

## Implemented Worker Flow

1. Worker opens splash screen.
2. Worker logs in with phone + password or opens registration.
3. Registration submits worker profile to `POST /auth/worker/register`.
4. Registration OTP verification and password creation uses `POST /auth/worker/complete-registration`.
5. Pending/rejected/suspended/inactive statuses block protected app access.
6. Approved worker receives access and refresh tokens after phone/password login.
7. Protected requests attach `Authorization: Bearer <access_token>`.
8. 401 responses attempt `POST /auth/refresh`.
9. Worker dashboard loads `/workers/me` and `/assignments`.
10. Worker can view assignments, accept/reject them, and open assignment details.
11. Accepted active assignments show attendance check-in/check-out.
12. Attendance uses manual QR token input with `/attendance/check-in` and `/attendance/check-out`.
13. Worker can view notifications and mark them as read.

## Azerbaijani UX

All app-owned labels, buttons, validation messages, status labels, empty states, loading/error/success messages, dialogs, and navigation labels are centralized in:

```text
lib/shared/app_strings.dart
```

Backend error codes are mapped to Azerbaijani messages before display.

## Test Steps

Start the backend and run the full MVP seed/smoke flow first, then:

```bash
cd apps/worker_app
flutter pub get
flutter run --dart-define=BASE_URL=http://localhost:3000
```

## Visual Preview Commands

Chrome preview:

```bash
flutter run -d chrome --dart-define=BASE_URL=http://localhost:3000
```

Android emulator preview:

```bash
flutter emulators --launch <emulator_id>
flutter run -d emulator --dart-define=BASE_URL=http://10.0.2.2:3000
```

Physical Android phone on the same Wi-Fi:

```bash
flutter devices
flutter run -d <device_id> --dart-define=BASE_URL=http://YOUR_LAN_IP:3000
```

Production-style debug build:

```bash
flutter build apk --debug --dart-define=BASE_URL=https://api.yourdomain.com
```

Manual test flow:

1. Register a new worker with an Azerbaijan phone format such as `+994501234567`.
2. Verify OTP using the backend test OTP if local test mode is enabled and create a password.
3. Confirm the app shows `Təsdiq gözlənilir`.
4. Approve the worker from the admin panel/API.
5. Login as the approved worker with phone + password.
6. Confirm dashboard, assignment list, and notifications load.
7. Open an assigned task and tap `Növbəni qəbul et`.
8. Generate attendance QR token from admin/company API.
9. Paste the token into the worker app and tap `Giriş et`.
10. Try duplicate check-in and confirm a clear 409 Azerbaijani error.
11. Tap `Çıxış et`.
12. Try check-in again and confirm the completed attendance error.

## Current MVP Notes

- QR camera scanning is implemented for Android/iOS with manual token input fallback.
- Native Android launch screen, adaptive icon, and iOS launch screen are prepared with the SET Service premium hospitality palette.
- Release builds still require a non-local `BASE_URL`.
- Firebase config files are optional for local visual preview; push registration is skipped safely when Firebase is not configured.
