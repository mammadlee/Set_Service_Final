import '../core/config/app_config.dart';

abstract final class LegalLinks {
  static Uri get privacy => Uri.parse('${AppConfig.rawBaseUrl}/privacy');
  static Uri get terms => Uri.parse('${AppConfig.rawBaseUrl}/terms');
  static Uri get accountDeletion =>
      Uri.parse('${AppConfig.rawBaseUrl}/account-deletion');
}
