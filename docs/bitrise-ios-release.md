# Bitrise iOS 1.0.0+15 release preparation — no build triggered

This is a human-reviewed future workflow. It does not authorize a build,
upload, deploy, or Bitrise configuration change. The current local release
candidate was based on
`d42d6081b801f3d876ec585fe434a815e4cd551f`; use the full SHA of the final
approved release commit after local preparation and remote verification. Never
build a moving branch head.

The Bitrise dashboard was previously verified with these hosted trigger
mappings:

- `ios_release`: push only from `codex/play-store-live-final-hardening`, plus a
  wildcard pull-request trigger.
- `run_tests`: push only from `codex/play-store-live-final-hardening`, plus a
  wildcard pull-request trigger.

The `ios_release` workflow archives and uploads to App Store Connect, so either
of its current mappings can start an automatic upload. The configuration is
dashboard-hosted; there is no repository `bitrise.yml` that can safely change
these mappings in this commit.

Before pushing or opening a pull request, make the minimal dashboard change:

1. Remove only the `ios_release` push trigger mapping.
2. Remove only the `ios_release` pull-request trigger mapping.
3. Leave both `run_tests` mappings unchanged.
4. Save, reload the trigger page, and capture evidence that `ios_release` is
   manual-only and `run_tests` remains enabled.

This change has been prepared but has **not** been performed. Until its evidence
is reviewed, do not push the release branch or open a pull request.

For the approved manual build, select workflow `ios_release`, the exact remote
commit SHA, and version `1.0.0+15`. Confirm the Bitrise checkout log shows that
full SHA before signing. Build 15 was reported unused during local preparation;
check App Store Connect again immediately before archive/upload because that
external state can change.

1. Choose a supported macOS Bitrise stack and recheck Apple's current Xcode/iOS
   SDK requirement. The previous successful build #50 used Xcode 27.0. Record
   `flutter --version`, `xcodebuild -version`, the iOS SDK, CocoaPods version,
   bundle ID, version/build, production API define, selected workflow, and full
   SHA.
2. In `apps/worker_app`, run `flutter clean`, `flutter pub get`,
   `flutter analyze`, and `flutter test`. Run normal `pod install` in `ios` and
   inspect the resolved lockfile, privacy manifests/signatures, and generated
   Xcode privacy report.
3. Inject `Runner/GoogleService-Info.plist` through Bitrise secure file storage
   for the matching iOS Firebase app. Keep signing certificates, profiles, API
   keys, `.p8` content, and passwords out of Git and logs.
4. Build the no-code-sign Release app first with
   `--dart-define=BASE_URL=https://api.setservice.az`. Verify bundle ID
   `az.setservice.app`, `CFBundleShortVersionString=1.0.0`,
   `CFBundleVersion=15`, ATS, privacy manifest, app icons, URL schemes,
   entitlements, and absence of localhost/debug endpoints.
5. After the separate build approval, run the manual `ios_release` job for that
   exact SHA. Confirm the signed archive identity and perform physical-device
   Worker, Company, and Admin reviewer-login checks before submission.

The App Store Connect upload produced by `ios_release` and the later App Review
submission are separate approval gates. No Bitrise job or external account
state was changed while preparing this document.
