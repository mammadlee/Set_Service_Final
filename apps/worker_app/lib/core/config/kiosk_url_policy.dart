import 'package:flutter/foundation.dart';

class KioskUrlPolicy {
  const KioskUrlPolicy._();

  static const _productionBaseUrl = 'https://qr.setservice.az';
  static const _legacyProductionHost = 'kiosk.setservice.az';
  static const _configuredBaseUrl = String.fromEnvironment(
    'KIOSK_BASE_URL',
    defaultValue: _productionBaseUrl,
  );

  static bool isAllowed(String value) =>
      isAllowedForBase(value, allowedBaseUrl: _configuredBaseUrl);

  /// Resolves only trusted kiosk capability links. The retired production
  /// origin is translated locally; callers must use this returned URL, never
  /// navigate to the retired host and rely on an HTTP redirect.
  static String? resolve(String value) =>
      resolveForBase(value, allowedBaseUrl: _configuredBaseUrl);

  @visibleForTesting
  static bool isAllowedForBase(
    String value, {
    required String allowedBaseUrl,
  }) => resolveForBase(value, allowedBaseUrl: allowedBaseUrl) == value;

  @visibleForTesting
  static String? resolveForBase(
    String value, {
    required String allowedBaseUrl,
  }) {
    if (_hasUnsafeUrlSyntax(value) || _hasUnsafeUrlSyntax(allowedBaseUrl)) {
      return null;
    }
    final candidate = Uri.tryParse(value);
    var allowedBase = Uri.tryParse(allowedBaseUrl);
    if (!_isValidHttpsOrigin(candidate) || !_isValidHttpsOrigin(allowedBase)) {
      return null;
    }
    if (allowedBase!.hasQuery || allowedBase.hasFragment) return null;
    if (allowedBase.host.toLowerCase() == _legacyProductionHost) {
      if (!_isProductionRoot(allowedBase, _legacyProductionHost)) return null;
      // Older release pipelines supplied the previous production origin.
      allowedBase = Uri.parse(_productionBaseUrl);
    }
    if (allowedBase.host.toLowerCase() == 'qr.setservice.az' &&
        !_isProductionRoot(allowedBase, 'qr.setservice.az')) {
      return null;
    }

    final basePath = allowedBase.path == '/'
        ? ''
        : allowedBase.path.replaceAll(RegExp(r'/+$'), '');
    final expectedPath = '$basePath/kiosk';
    final fragment = candidate!.fragment;
    if (candidate.hasQuery ||
        candidate.path != expectedPath ||
        !RegExp(r'^capability=[A-Za-z0-9_-]+$').hasMatch(fragment)) {
      return null;
    }

    final sameOrigin =
        candidate.host.toLowerCase() == allowedBase.host.toLowerCase() &&
        candidate.port == allowedBase.port;
    final trustedLegacyOrigin =
        _isProductionRoot(allowedBase, 'qr.setservice.az') &&
        candidate.host.toLowerCase() == _legacyProductionHost &&
        candidate.port == 443;
    if (!sameOrigin && !trustedLegacyOrigin) return null;

    return allowedBase
        .replace(path: expectedPath, fragment: fragment)
        .toString();
  }

  static bool _isProductionRoot(Uri uri, String host) =>
      uri.host.toLowerCase() == host &&
      uri.port == 443 &&
      (uri.path.isEmpty || uri.path == '/');

  static bool _hasUnsafeUrlSyntax(String value) =>
      value.isEmpty ||
      RegExp(r'[\s\x00-\x1f\x7f%\\]').hasMatch(value) ||
      // Uri normalizes dot segments; reject them before parsing so they
      // cannot become an apparently valid /kiosk path.
      RegExp(r'/(?:\.|\.\.)(?:/|[?#]|$)').hasMatch(value);

  static bool _isValidHttpsOrigin(Uri? uri) =>
      uri != null &&
      uri.hasScheme &&
      uri.scheme.toLowerCase() == 'https' &&
      uri.host.isNotEmpty &&
      uri.userInfo.isEmpty;
}
