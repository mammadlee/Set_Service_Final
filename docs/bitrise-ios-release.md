# Bitrise iOS release preparation — no build triggered

This is a human-reviewed future workflow, not authorization to upload or deploy. Select the exact reviewed Git SHA on `codex/play-store-live-final-hardening` (or its later approved successor); do not build a moving branch head. Record SHA, UTC build time, Flutter version, Xcode/iOS SDK, CocoaPods version, bundle ID, `1.0.0+4` or approved next version/build number, and production HTTPS API define.

1. Choose a macOS Bitrise stack with **Xcode 26+ and iOS 26 SDK+** (recheck Apple's current requirement when building). Install the project-compatible Flutter SDK, run `flutter --version`, `xcodebuild -version`, `xcrun --sdk iphoneos --show-sdk-version`, `pod --version`.
2. In `apps/worker_app`, run `flutter clean`, `flutter pub get`, `flutter analyze`, `flutter test`. From `ios`, run `pod install --repo-update` only on the isolated CI checkout; inspect the resolved Podfile.lock, SDK privacy manifests/signatures and Xcode-generated privacy report. Do not commit generated secrets.
3. Inject `Runner/GoogleService-Info.plist` through secure file storage with the matching iOS Firebase app. If push is enabled, configure the Apple App ID, APNs/Firebase mapping, Push Notifications capability and signed `aps-environment`; test delivery on a physical device.
4. First run `flutter build ios --release --no-codesign` with production-safe defines. Inspect built Info.plist, privacy manifest, ATS, bundle ID/version, app icon, URL schemes, entitlements, native dependency list and absence of localhost/debug endpoints.
5. Only after approval, connect the Apple Developer team, distribution certificate/private key and App Store provisioning profile in Bitrise secure signing storage. Validate a Release Archive and export IPA without upload. Validate real-device Worker/Company/Admin flows and screenshots.
6. TestFlight upload is a separate **future approval gate**. App Store production upload and App Review submission are further distinct gates. An App Store Connect API key (`<ASC_KEY_ID>`, `<ASC_ISSUER_ID>`, `<ASC_P8_SECRET>`) is needed only if the chosen approved automation uses that API.

Never log or commit signing files, `.p8`, passwords or the real Firebase file. Check the next unused App Store Connect build number before any upload. No Bitrise job or external account state was changed in this phase.
