import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/storage/secure_storage_config.dart';
import 'package:worker_app/features/attendance/data/models/kiosk_session.dart';

void main() {
  group('Android release transport and backup security', () {
    test('cleartext is disabled by default and enabled only for debug', () {
      final gradle = _read('android/app/build.gradle.kts');
      final defaultConfig = _block(gradle, 'defaultConfig {');
      final debug = _block(gradle, 'debug {');
      final release = _block(gradle, 'release {');

      expect(
        defaultConfig,
        contains('manifestPlaceholders["usesCleartextTraffic"] = "false"'),
      );
      expect(
        debug,
        contains('manifestPlaceholders["usesCleartextTraffic"] = "true"'),
      );
      expect(
        release,
        contains('manifestPlaceholders["usesCleartextTraffic"] = "false"'),
      );
      expect(
        _read('android/app/src/main/res/xml/network_security_config.xml'),
        contains('cleartextTrafficPermitted="false"'),
      );
      expect(
        _read('android/app/src/debug/res/xml/network_security_config.xml'),
        contains('cleartextTrafficPermitted="true"'),
      );
    });

    test('Android backup and device-transfer extraction are excluded', () {
      final manifest = _read('android/app/src/main/AndroidManifest.xml');
      expect(manifest, contains('android:allowBackup="false"'));
      expect(
        manifest,
        contains('android:fullBackupContent="@xml/backup_rules"'),
      );
      expect(
        manifest,
        contains('android:dataExtractionRules="@xml/data_extraction_rules"'),
      );

      final backupRules = _read(
        'android/app/src/main/res/xml/backup_rules.xml',
      );
      final extractionRules = _read(
        'android/app/src/main/res/xml/data_extraction_rules.xml',
      );
      expect(backupRules, contains('<exclude domain="sharedpref" path="." />'));
      expect(extractionRules, contains('<cloud-backup'));
      expect(extractionRules, contains('<device-transfer>'));
      expect(
        extractionRules,
        contains('<exclude domain="sharedpref" path="." />'),
      );
    });

    test('Gradle wrapper distribution is checksum-pinned', () {
      final wrapper = _read('android/gradle/wrapper/gradle-wrapper.properties');
      expect(
        wrapper,
        contains(
          'distributionUrl=https\\://services.gradle.org/distributions/'
          'gradle-8.12-all.zip',
        ),
      );
      expect(
        wrapper,
        contains(
          'distributionSha256Sum='
          '7ebdac923867a3cec0098302416d1e3c6c0c729fc4e2e05c10637a8af33a76c5',
        ),
      );
    });
  });

  group('central secure storage policy', () {
    test('uses encrypted Android storage and device-bound Apple keychain', () {
      expect(SecureStorageConfig.androidEncryptedSharedPreferences, isTrue);
      expect(
        SecureStorageConfig.appleAccessibility,
        KeychainAccessibility.first_unlock_this_device,
      );
      expect(SecureStorageConfig.storage, isA<FlutterSecureStorage>());
    });

    test(
      'production code does not instantiate unconfigured secure storage',
      () {
        final rawConstructors = Directory('lib')
            .listSync(recursive: true)
            .whereType<File>()
            .where((file) => file.path.endsWith('.dart'))
            .where((file) => !file.path.endsWith('secure_storage_config.dart'))
            .where(
              (file) => file.readAsStringSync().contains(
                'const FlutterSecureStorage()',
              ),
            )
            .map((file) => file.path)
            .toList();

        expect(rawConstructors, isEmpty);
      },
    );
  });

  group('kiosk URL security', () {
    test('accepts only the whitelisted kiosk origin and capability path', () {
      expect(
        KioskSessionResult.isSecureKioskUrl(
          'https://kiosk.setservice.az/kiosk#capability=abc',
        ),
        isTrue,
      );
      expect(
        KioskSessionResult.isSecureKioskUrl(
          'https://evil.example.test/kiosk#capability=abc',
        ),
        isFalse,
      );
      expect(
        KioskSessionResult.isSecureKioskUrl(
          'https://kiosk.setservice.az.evil.test/kiosk#capability=abc',
        ),
        isFalse,
      );
      expect(
        KioskSessionResult.isSecureKioskUrl(
          'https://user:pass@kiosk.setservice.az/kiosk#capability=abc',
        ),
        isFalse,
      );
      expect(
        KioskSessionResult.isSecureKioskUrl('javascript:alert(1)'),
        isFalse,
      );
      expect(KioskSessionResult.isSecureKioskUrl('/relative/session'), isFalse);
    });

    test('rejects an insecure URL while parsing the API response', () {
      expect(
        () => KioskSessionResult.fromJson({
          'kiosk_url': 'https://evil.example.test/kiosk#capability=abc',
        }),
        throwsFormatException,
      );
    });
  });
}

String _read(String path) => File(path).readAsStringSync();

String _block(String source, String marker) {
  final start = source.indexOf(marker);
  if (start < 0) return '';

  var depth = 0;
  var opened = false;
  for (var index = start; index < source.length; index += 1) {
    final character = source[index];
    if (character == '{') {
      depth += 1;
      opened = true;
    } else if (character == '}') {
      depth -= 1;
      if (opened && depth == 0) {
        return source.substring(start, index + 1);
      }
    }
  }
  return source.substring(start);
}
