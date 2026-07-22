import 'package:flutter/foundation.dart';

class KioskUrlPolicy {
  const KioskUrlPolicy._();

  static const _productionBaseUrl = 'https://kiosk.setservice.az';
  static const _configuredBaseUrl = String.fromEnvironment(
    'KIOSK_BASE_URL',
    defaultValue: _productionBaseUrl,
  );

  static bool isAllowed(String value) =>
      isAllowedForBase(value, allowedBaseUrl: _configuredBaseUrl);

  @visibleForTesting
  static bool isAllowedForBase(String value, {required String allowedBaseUrl}) {
    final candidate = Uri.tryParse(value.trim());
    final allowedBase = Uri.tryParse(allowedBaseUrl.trim());
    if (!_isValidHttpsOrigin(candidate) || !_isValidHttpsOrigin(allowedBase)) {
      return false;
    }
    if (allowedBase!.hasQuery || allowedBase.hasFragment) return false;

    final basePath = allowedBase.path == '/'
        ? ''
        : allowedBase.path.replaceAll(RegExp(r'/+$'), '');
    final expectedPath = '$basePath/kiosk';
    final fragment = candidate!.fragment;
    const capabilityPrefix = 'capability=';

    return candidate.scheme.toLowerCase() == allowedBase.scheme.toLowerCase() &&
        candidate.host.toLowerCase() == allowedBase.host.toLowerCase() &&
        candidate.port == allowedBase.port &&
        candidate.path == expectedPath &&
        !candidate.hasQuery &&
        fragment.startsWith(capabilityPrefix) &&
        fragment.length > capabilityPrefix.length &&
        !fragment.contains('&');
  }

  static bool _isValidHttpsOrigin(Uri? uri) =>
      uri != null &&
      uri.hasScheme &&
      uri.scheme.toLowerCase() == 'https' &&
      uri.host.isNotEmpty &&
      uri.userInfo.isEmpty;
}
