# SET Service — App Store Connect release checklist

Status: **manual account-holder work, not submitted**. Source candidate `1.0.0+4`; Bundle ID in the iOS project is `az.setservice.app`. Confirm that identifier exists for the intended Apple Developer team and App Store Connect record. Verify the **next unused App Store Connect build number** before upload; Play versionCode and iOS build number are independent counters. Do not reuse an old IPA/archive.

## App Information — owner completion

- [ ] App name, subtitle, primary category and optional secondary category; confirm localized spelling and availability.
- [ ] Bundle ID/App ID/team match; content rights and copyright owner/legal name.
- [ ] Complete Apple's current age-rating questionnaire from actual content: user-generated order text, reviews/reporting, admin moderation, job context and adult-workforce Terms (18+). Apply any appropriate age override only after the owner checks current Apple controls. Not Kids/Made for Kids.
- [ ] Privacy Policy URL `https://api.setservice.az/privacy` and Support URL; optional Marketing URL if actually maintained. Verify public HTTP 200 and mobile readability.
- [ ] Availability territories; EU DSA trader/business information if applicable; any requested regulated-medical declaration answered based on actual non-diagnostic workforce functionality.

## Version and assets — owner completion

- [ ] Final reviewed SHA, version/build, Xcode/iOS SDK/Flutter/Pods versions and fresh archive recorded; confirm `CFBundleShortVersionString` and `CFBundleVersion` in the exported app.
- [ ] iPhone and iPad screenshots for supported device families; real screens, no personal worker documents or alpha/transparency. Localized description, keywords and optional promotional text.
- [ ] Release method, territories/pricing, TestFlight feedback and staged availability decision. No upload in this phase.
- [ ] Review functional iPhone SE/narrow-width, modern iPhone and iPad screenshots at normal and large text, camera denial, file upload, privacy and deletion screens.

## App Review Information — owner completion

- [ ] Contact name, reachable email and international-format phone number.
- [ ] Stable Worker, Company and (while present in binary) Admin demo username/password and role instructions, provided only in App Store Connect. See [review access](app-store-review-access.md).
- [ ] Sample accepted assignment, QR kiosk/test token, sample order, reviewable moderation content; no real sensitive documents.
- [ ] Review Notes explain role selector, OTP-free reviewer sign-in, approval state, QR prerequisites, report actions, privacy/terms links and in-app account deletion.

## App Privacy and compliance — owner completion

- [ ] Reconcile [Apple App Privacy inventory](app-store-privacy.md), [cross-store consistency](store-privacy-consistency.md), the built Xcode privacy report and actual Firebase/native SDK settings. Answer every collected category, purpose, linked-to-user and tracking question; do not copy Google Play answers mechanically.
- [ ] Confirm health certificate and criminal-record disclosures, optional company documents, public profile photo, device/FCM identifiers and authorized sharing; confirm no device GPS, ads or cross-app tracking if release evidence still supports it.
- [ ] Complete export-compliance classification from [decision record](ios-export-compliance.md); do not infer exemption from HTTPS alone.
- [ ] Confirm account deletion and moderation work for both roles in the signed TestFlight candidate.
- [ ] No StoreKit/In-App Purchases or digital paid unlocks are implemented in checked mobile code; only create App Store products if future product functionality actually requires them.

## Release gates

Xcode 26+/iOS 26 SDK+ macOS build, `pod install`, native SDK manifest/signature review, no-codesign build, signed archive validation, APNs/FCM device test, App Store Connect record/build-number check, reviewer accounts and privacy/metadata sign-off are outstanding. TestFlight upload, production App Store upload and Review submission each require separate explicit authorization. This checklist does not approve deployment.
