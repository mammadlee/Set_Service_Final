import 'package:flutter/foundation.dart';

enum AppConfigIssue {
  missingBaseUrl,
  invalidBaseUrl,
  localBaseUrl,
  insecureBaseUrl,
}

class AppConfig {
  static const _defaultBaseUrl = 'http://localhost:3000';
  static const _configuredBaseUrl = String.fromEnvironment('BASE_URL');
  static const pushNotificationsEnabled = bool.fromEnvironment(
    'ENABLE_PUSH_NOTIFICATIONS',
    defaultValue: kReleaseMode,
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
    return validateBaseUrl(_configuredBaseUrl, releaseMode: kReleaseMode);
  }

  @visibleForTesting
  static AppConfigIssue? validateBaseUrl(
    String configured, {
    required bool releaseMode,
  }) {
    if (!releaseMode) return null;

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
