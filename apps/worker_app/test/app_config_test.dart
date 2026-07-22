import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/config/app_config.dart';

void main() {
  test('default API base URL includes v1 prefix', () {
    expect(AppConfig.apiBaseUrl, 'http://localhost:3000/v1');
  });

  test('normalizes whitespace and trailing slashes in configured URLs', () {
    expect(
      AppConfig.normalizeBaseUrl('  https://api.example.test///  '),
      'https://api.example.test',
    );
  });

  group('release API base URL validation', () {
    test('requires an explicit base URL', () {
      expect(
        AppConfig.validateBaseUrl('', releaseMode: true),
        AppConfigIssue.missingBaseUrl,
      );
    });

    test('rejects malformed, credentialed, and query URLs', () {
      expect(
        AppConfig.validateBaseUrl('not a url', releaseMode: true),
        AppConfigIssue.invalidBaseUrl,
      );
      expect(
        AppConfig.validateBaseUrl(
          'https://user:pass@api.example.test',
          releaseMode: true,
        ),
        AppConfigIssue.invalidBaseUrl,
      );
      expect(
        AppConfig.validateBaseUrl(
          'https://api.example.test?token=value',
          releaseMode: true,
        ),
        AppConfigIssue.invalidBaseUrl,
      );
    });

    test('rejects local and cleartext release endpoints', () {
      expect(
        AppConfig.validateBaseUrl('http://10.0.2.2:3000', releaseMode: true),
        AppConfigIssue.localBaseUrl,
      );
      expect(
        AppConfig.validateBaseUrl('http://api.example.test', releaseMode: true),
        AppConfigIssue.insecureBaseUrl,
      );
    });

    test('accepts HTTPS and keeps debug configuration flexible', () {
      expect(
        AppConfig.validateBaseUrl(
          'https://api.example.test',
          releaseMode: true,
        ),
        isNull,
      );
      expect(
        AppConfig.validateBaseUrl('http://localhost:3000', releaseMode: false),
        isNull,
      );
    });
  });
}
