# iOS release configuration and secret handoff

Status: preparation only. No signing material or Firebase configuration is committed here. Store actual values only in the approved Apple Developer/Firebase/CI secret stores.

| Item | Source and handling | Verification on the final macOS build |
| --- | --- | --- |
| Apple Developer Team ID | `<APPLE_TEAM_ID>`; non-secret identifier, but not present in the project | Match the selected signing team to the intended SET Service App ID |
| Bundle ID | Source is `az.setservice.app` in all Runner build configurations | Match the App Store Connect app record and Apple Developer App ID; never assume the Android package establishes this |
| Distribution signing | `<DISTRIBUTION_CERTIFICATE_AND_PRIVATE_KEY>` and `<APP_STORE_PROVISIONING_PROFILE>` in secure CI signing storage | Xcode archive/export uses the correct team, bundle ID and distribution profile; never log or commit contents |
| Firebase iOS app configuration | `Runner/GoogleService-Info.plist` is ignored and absent in this checkout | Provision the file from the intended Firebase iOS app, verify `BUNDLE_ID=az.setservice.app` and project selection without printing the file; include it in the app bundle |
| APNs auth | `<APNS_AUTH_KEY>` / Key ID / Team ID in Firebase Console or approved provider, not the repository | Enable Push Notifications on the App ID, use matching provisioning profile and `aps-environment` entitlement, then test device token, refresh, notification delivery and logout token removal on a real iPhone |
| App Store Connect API | `<ASC_API_KEY_ID>`, `<ASC_ISSUER_ID>`, `<ASC_PRIVATE_KEY_P8>` only if automated upload is later approved | Limit CI key permissions; no upload in this phase |

The current `Runner.entitlements` is empty; push capability, `aps-environment`, signed archive and APNs/Firebase mapping are **not validated**. Do not add an entitlement value by guesswork: use the correct Apple signing team/App ID and inspect the signed archive. The app's `ENABLE_PUSH_NOTIFICATIONS` Dart define defaults to false; a release enabling it must also provide the matching iOS Firebase/APNs configuration and pass on-device tests. Do not use a production signing key in local debug builds.

No `GoogleService-Info.plist`, Pod lockfile, provisioning profile, APNs key or signing certificate should be copied into issue comments or release reports. Rotate any accidentally exposed credential through its owning account.
