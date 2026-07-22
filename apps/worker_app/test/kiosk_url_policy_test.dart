import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/config/kiosk_url_policy.dart';

void main() {
  const base = 'https://kiosk.example.test/app';

  test('allows only the configured origin and exact kiosk capability path', () {
    expect(
      KioskUrlPolicy.isAllowedForBase(
        'https://kiosk.example.test/app/kiosk#capability=token',
        allowedBaseUrl: base,
      ),
      isTrue,
    );
    expect(
      KioskUrlPolicy.isAllowedForBase(
        'https://kiosk.example.test/app/kiosk/extra#capability=token',
        allowedBaseUrl: base,
      ),
      isFalse,
    );
    expect(
      KioskUrlPolicy.isAllowedForBase(
        'https://kiosk.example.test/app/kiosk?next=evil#capability=token',
        allowedBaseUrl: base,
      ),
      isFalse,
    );
  });

  test('rejects origin confusion and unsafe schemes', () {
    for (final value in <String>[
      'http://kiosk.example.test/app/kiosk#capability=token',
      'https://evil.example.test/app/kiosk#capability=token',
      'https://kiosk.example.test.evil.test/app/kiosk#capability=token',
      'https://user:pass@kiosk.example.test/app/kiosk#capability=token',
      'javascript:alert(1)',
      '/app/kiosk#capability=token',
    ]) {
      expect(
        KioskUrlPolicy.isAllowedForBase(value, allowedBaseUrl: base),
        isFalse,
        reason: value,
      );
    }
  });

  test('requires a non-empty single capability fragment', () {
    for (final value in <String>[
      'https://kiosk.example.test/app/kiosk',
      'https://kiosk.example.test/app/kiosk#capability=',
      'https://kiosk.example.test/app/kiosk#capability=token&next=evil',
    ]) {
      expect(
        KioskUrlPolicy.isAllowedForBase(value, allowedBaseUrl: base),
        isFalse,
        reason: value,
      );
    }
  });
}
