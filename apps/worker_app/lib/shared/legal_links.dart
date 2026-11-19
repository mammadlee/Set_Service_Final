import '../core/config/app_config.dart';

abstract final class LegalLinks {
  static Uri publicUrlFor(String rawBaseUrl, String page) {
    final base = rawBaseUrl
        .replaceAll(RegExp(r'/+$'), '')
        .replaceFirst(RegExp(r'/v1$'), '');
    return Uri.parse('$base/$page');
  }

  static Uri get privacy => publicUrlFor(AppConfig.rawBaseUrl, 'privacy');
  static Uri get terms => publicUrlFor(AppConfig.rawBaseUrl, 'terms');
  static Uri get accountDeletion =>
      publicUrlFor(AppConfig.rawBaseUrl, 'account-deletion');
}
