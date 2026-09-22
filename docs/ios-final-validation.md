# iOS final validation command pack

Status: **PENDING MACOS EXECUTION**. The current host is Windows; these commands have not been run here and no signed archive or IPA has been created. Execute from the exact reviewed SHA `00754e3e8df15d3b8c52bf19bb9b402547316fc6` on `codex/play-store-live-final-hardening` (or an explicitly approved successor).

## Toolchain and source checks

```bash
cd apps/worker_app
flutter --version
flutter doctor -v
xcodebuild -version
xcrun --sdk iphoneos --show-sdk-version
pod --version
git rev-parse HEAD
git status --short
```

Confirm the Apple upload toolchain meets the current App Store Connect requirement before proceeding. Record Flutter, Dart, Xcode, iOS SDK, CocoaPods and macOS versions in the release record.

## Clean dependency and test pass

```bash
flutter clean
flutter pub get
flutter analyze
flutter test
cd ios
pod install
cd ..
```

Use the normal `pod install` against the reviewed dependency lock/configuration. Use `pod repo update` only when dependency resolution genuinely requires repository metadata refresh; do not silently change dependency versions during release validation. Inspect `ios/Podfile.lock` and the assembled pod privacy manifests/signatures.

## No-code-sign release build

```bash
flutter build ios --release --no-codesign \
  --dart-define=BASE_URL=https://api.setservice.az
```

Inspect the built app before any signing step:

- `CFBundleIdentifier=az.setservice.app`
- `CFBundleShortVersionString=1.0.0`
- `CFBundleVersion=4` unless App Store Connect evidence requires a new unused build number
- HTTPS production API only; no localhost or debug endpoint
- ATS does not allow arbitrary loads
- camera/photo usage strings are present; no location/microphone/tracking strings
- `PrivacyInfo.xcprivacy` is packaged
- no unexpected URL schemes/background modes
- app icon and iPhone/iPad orientations are correct

## Archive validation — no upload

Inject signing through the approved CI/keychain only. Do not put certificates, profiles, `.p8` keys or passwords in Git.

```bash
xcodebuild -workspace ios/Runner.xcworkspace \
  -scheme Runner \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$PWD/build/ios/archive/Runner.xcarchive" \
  archive

xcodebuild -exportArchive \
  -archivePath "$PWD/build/ios/archive/Runner.xcarchive" \
  -exportOptionsPlist /secure/path/ExportOptions.plist \
  -exportPath "$PWD/build/ios/ipa"
```

Validate the archive/export with `codesign`, `security cms`, Xcode Organizer and App Store Connect Transporter validation as appropriate, but stop before upload unless separately authorized. Confirm the signed entitlements contain the correct team/App ID and APNs capability only when provisioned by the approved Apple Developer configuration.

## Physical-device smoke pass

Use disposable approved review accounts and a non-production/staging-safe test dataset. Test Worker, Company and Admin (if shipped), QR camera allow/deny/manual fallback, file picker, push permission allow/deny, logout, account deletion, expired session, offline state, privacy links, Dynamic Type and narrow iPhone layout. Record failures and screenshots; do not use real health/criminal documents.
