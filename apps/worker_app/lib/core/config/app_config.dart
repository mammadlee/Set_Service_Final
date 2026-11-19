import 'package:flutter/foundation.dart';

enum AppConfigIssue {
  missingEnvironment,
  invalidEnvironment,
  missingBaseUrl,
  invalidBaseUrl,
  localBaseUrl,
  insecureBaseUrl,
  environmentBaseUrlMismatch,
}

class AppConfig {
  // Real-device/debug builds must work without an extra --dart-define.
  // Local backend testing can still override this with BASE_URL.
  static const _defaultBaseUrl = 'https://api.setservice.az';
  static const _productionBaseUrl = 'https://api.setservice.az';
  static const _ciBaseUrl = 'https://api.invalid';
  static const _configuredEnvironment = String.fromEnvironment('APP_ENV');
  static const _configuredBaseUrl = String.fromEnvironment('BASE_URL');
  static const pushNotificationsEnabled = bool.fromEnvironment(
    'ENABLE_PUSH_NOTIFICATIONS',
    defaultValue: false,
  );

  static String get rawBaseUrl => normalizeBaseUrl(_configuredBaseUrl);

  @visibleForTesting
  static String normalizeBaseUrl(String configured) {
    final normalized = configured.trim();
    if (normalized.isEmpty) return _defaultBaseUrl;
    return normalized.replaceAll(RegExp(r'/+$'), '');
  }

  static String get apiBaseUrl {
    final base = rawBaseUrl;
    return base.endsWith('/v1') ? base : '$base/v1';
  }

  static AppConfigIssue? get configIssue {
    return validateBaseUrl(
      _configuredBaseUrl,
      appEnvironment: _configuredEnvironment,
      releaseMode: kReleaseMode,
    );
  }

  @visibleForTesting
  static AppConfigIssue? validateBaseUrl(
    String configured, {
    String appEnvironment = 'production',
    required bool releaseMode,
  }) {
    if (!releaseMode) return null;

    final environment = appEnvironment.trim().toLowerCase();
    if (environment.isEmpty) return AppConfigIssue.missingEnvironment;
    if (environment != 'production' &&
        environment != 'staging' &&
        environment != 'ci') {
      return AppConfigIssue.invalidEnvironment;
    }

    final value = configured.trim();
    if (value.isEmpty) return AppConfigIssue.missingBaseUrl;

    final normalized = value.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(normalized);
    if (uri == null ||
        !uri.isAbsolute ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment) {
      return AppConfigIssue.invalidBaseUrl;
    }
    if (_isLocalBaseUrl(normalized)) return AppConfigIssue.localBaseUrl;
    if (uri.scheme.toLowerCase() != 'https') {
      return AppConfigIssue.insecureBaseUrl;
    }

    final normalizedHost = uri.host.toLowerCase();
    final normalizedPath = uri.path.replaceAll(RegExp(r'/+$'), '');
    if (environment == 'production') {
      if (normalizedHost != Uri.parse(_productionBaseUrl).host ||
          uri.port != 443 ||
          (normalizedPath.isNotEmpty && normalizedPath != '/v1')) {
        return AppConfigIssue.environmentBaseUrlMismatch;
      }
    } else if (environment == 'staging') {
      if (normalizedHost == Uri.parse(_productionBaseUrl).host) {
        return AppConfigIssue.environmentBaseUrlMismatch;
      }
    } else if (normalized != _ciBaseUrl) {
      return AppConfigIssue.environmentBaseUrlMismatch;
    }

    return null;
  }

  static bool _isLocalBaseUrl(String value) {
    final uri = Uri.tryParse(value);
    final host = (uri?.host ?? value).toLowerCase();
    return host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '0.0.0.0' ||
        host == '::1' ||
        host == '10.0.2.2';
  }
}
