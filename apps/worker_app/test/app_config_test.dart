import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/config/app_config.dart';

void main() {
  test('default API base URL includes v1 prefix', () {
    expect(AppConfig.apiBaseUrl, 'https://api.setservice.az/v1');
  });

  test('normalizes whitespace and trailing slashes in configured URLs', () {
    expect(
      AppConfig.normalizeBaseUrl('  https://api.example.test///  '),
      'https://api.example.test',
    );
  });

  group('release API base URL validation', () {
    test('requires explicit environment and base URL', () {
      expect(
        AppConfig.validateBaseUrl(
          'https://api.setservice.az',
          appEnvironment: '',
          releaseMode: true,
        ),
        AppConfigIssue.missingEnvironment,
      );
      expect(
        AppConfig.validateBaseUrl(
          'https://api.setservice.az',
          appEnvironment: 'unknown',
          releaseMode: true,
        ),
        AppConfigIssue.invalidEnvironment,
      );
      expect(
        AppConfig.validateBaseUrl(
          '',
          appEnvironment: 'production',
          releaseMode: true,
        ),
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
          'https://api.setservice.az',
          releaseMode: true,
        ),
        isNull,
      );
      expect(
        AppConfig.validateBaseUrl('http://localhost:3000', releaseMode: false),
        isNull,
      );
    });

    test('allows only the canonical production API origin and path', () {
      for (final value in [
        'https://api.setservice.az',
        'https://api.setservice.az/',
        'https://api.setservice.az/v1',
        'https://api.setservice.az/v1/',
      ]) {
        expect(
          AppConfig.validateBaseUrl(
            value,
            appEnvironment: 'production',
            releaseMode: true,
          ),
          isNull,
        );
      }
      expect(
        AppConfig.validateBaseUrl(
          'https://api.example.test',
          appEnvironment: 'production',
          releaseMode: true,
        ),
        AppConfigIssue.environmentBaseUrlMismatch,
      );
      expect(
        AppConfig.validateBaseUrl(
          'https://api.setservice.az/other',
          appEnvironment: 'production',
          releaseMode: true,
        ),
        AppConfigIssue.environmentBaseUrlMismatch,
      );
      expect(
        AppConfig.validateBaseUrl(
          'https://api.setservice.az:8443',
          appEnvironment: 'production',
          releaseMode: true,
        ),
        AppConfigIssue.environmentBaseUrlMismatch,
      );
    });

    test('staging rejects the production API origin', () {
      expect(
        AppConfig.validateBaseUrl(
          'https://staging-api.example.test',
          appEnvironment: 'staging',
          releaseMode: true,
        ),
        isNull,
      );
      expect(
        AppConfig.validateBaseUrl(
          'https://api.setservice.az',
          appEnvironment: 'staging',
          releaseMode: true,
        ),
        AppConfigIssue.environmentBaseUrlMismatch,
      );
    });

    test('ci accepts only the reserved non-routable endpoint', () {
      expect(
        AppConfig.validateBaseUrl(
          'https://api.invalid',
          appEnvironment: 'ci',
          releaseMode: true,
        ),
        isNull,
      );
      expect(
        AppConfig.validateBaseUrl(
          'https://api.setservice.az',
          appEnvironment: 'ci',
          releaseMode: true,
        ),
        AppConfigIssue.environmentBaseUrlMismatch,
      );
    });
  });
}
