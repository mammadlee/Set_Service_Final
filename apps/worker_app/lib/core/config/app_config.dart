import 'package:flutter/foundation.dart';

enum AppConfigIssue { missingBaseUrl, localBaseUrl }

class AppConfig {
  static const _defaultBaseUrl = 'http://localhost:3000';
  static const _configuredBaseUrl = String.fromEnvironment('BASE_URL');
  static const pushNotificationsEnabled = bool.fromEnvironment(
    'ENABLE_PUSH_NOTIFICATIONS',
    defaultValue: kReleaseMode,
  );

  static String get rawBaseUrl {
    const configured = _configuredBaseUrl;
    if (configured.trim().isEmpty) return _defaultBaseUrl;
    return configured.replaceAll(RegExp(r'/+$'), '');
  }

  static String get apiBaseUrl {
    final base = rawBaseUrl;
    return base.endsWith('/v1') ? base : '$base/v1';
  }

  static AppConfigIssue? get configIssue {
    if (!kReleaseMode) return null;

    final configured = _configuredBaseUrl.trim();
    if (configured.isEmpty) return AppConfigIssue.missingBaseUrl;

    final normalized = configured.replaceAll(RegExp(r'/+$'), '');
    if (_isLocalBaseUrl(normalized)) return AppConfigIssue.localBaseUrl;

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
