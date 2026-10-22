# iOS export-compliance decision record

Status: **manual legal/account-holder decision required**. Do not set `ITSAppUsesNonExemptEncryption` or answer App Store Connect export questions by guesswork.

Source evidence: production API URL is HTTPS (`apps/worker_app/lib/core/config/app_config.dart`); `flutter_secure_storage` keeps tokens in iOS Keychain (`secure_storage_config.dart`). `dart:math Random.secure` generates a device installation identifier (`push_registration_service.dart`). Native Firebase, Dio/networking, Flutter and any transitive pods still require a final compiled-SDK review. No custom encryption algorithm, private VPN or encrypted messaging product is evident in checked app code; absence in source is not a legal classification.

Before upload, the release owner should inventory every bundled cryptographic library and actual use, determine whether encryption is solely Apple OS facilities, standard third-party functions, or custom/proprietary code, then answer App Store Connect export questions under current applicable rules. If an exemption applies, retain the rationale/required documentation in the restricted release record. If uncertain, obtain export-compliance advice. Do not change Info.plist until that determination is recorded.

Apple reference: [Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance).
