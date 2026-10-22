import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/config/kiosk_url_policy.dart';
import 'package:worker_app/features/attendance/data/models/kiosk_session.dart';
import 'package:worker_app/features/company/data/company_kiosk.dart';

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

  test('resolves the retired production origin without navigating to it', () {
    const legacy =
        'https://kiosk.setservice.az/kiosk#capability=existing_session-123';
    const canonical =
        'https://qr.setservice.az/kiosk#capability=existing_session-123';
    for (final configuredBase in [
      'https://qr.setservice.az',
      'https://qr.setservice.az/',
      'https://kiosk.setservice.az',
      'https://kiosk.setservice.az/',
    ]) {
      expect(
        KioskUrlPolicy.resolveForBase(legacy, allowedBaseUrl: configuredBase),
        canonical,
      );
      expect(
        KioskUrlPolicy.resolveForBase(
          canonical,
          allowedBaseUrl: configuredBase,
        ),
        canonical,
      );
      expect(
        KioskUrlPolicy.isAllowedForBase(legacy, allowedBaseUrl: configuredBase),
        isFalse,
        reason: 'Raw legacy URLs must never be passed to launchUrl.',
      );
      expect(
        KioskUrlPolicy.isAllowedForBase(
          canonical,
          allowedBaseUrl: configuredBase,
        ),
        isTrue,
      );
    }
  });

  test('normalizes existing API sessions and blocks untrusted API links', () {
    const legacy =
        'https://kiosk.setservice.az/kiosk#capability=existing_session-123';
    const canonical =
        'https://qr.setservice.az/kiosk#capability=existing_session-123';
    final venue = CompanyVenueKiosk.fromJson({
      'id': 'existing-kiosk',
      'status': 'active',
      'active_session': {'order_id': 'existing-order'},
      'kiosk_url': legacy,
    });
    expect(venue.kioskUrl, canonical);
    expect(venue.orderId, 'existing-order');
    expect(venue.status, 'active');
    expect(
      KioskSessionResult.fromJson({'kiosk_url': legacy}).kioskUrl,
      canonical,
    );
    expect(
      CompanyVenueKiosk.fromJson({
        'kiosk_url': 'https://evil.test/kiosk#capability=token',
      }).kioskUrl,
      isNull,
    );
    expect(
      () => KioskSessionResult.fromJson({
        'kiosk_url': 'https://evil.test/kiosk#capability=token',
      }),
      throwsFormatException,
    );
  });

  test('legacy compatibility does not expand custom configured origins', () {
    expect(
      KioskUrlPolicy.resolveForBase(
        'https://kiosk.setservice.az/kiosk#capability=token',
        allowedBaseUrl: base,
      ),
      isNull,
    );
    expect(
      KioskUrlPolicy.resolveForBase(
        'https://qr.setservice.az/kiosk#capability=token',
        allowedBaseUrl: base,
      ),
      isNull,
    );
  });

  test('resolver rejects malformed links and unsafe legacy lookalikes', () {
    for (final value in <String>[
      'http://kiosk.setservice.az/kiosk#capability=token',
      'http://qr.setservice.az/kiosk#capability=token',
      'https://kiosk.setservice.az:444/kiosk#capability=token',
      'https://qr.setservice.az:444/kiosk#capability=token',
      'https://kiosk.setservice.az.evil.test/kiosk#capability=token',
      'https://kiosk.setservice.az@evil.test/kiosk#capability=token',
      'https://user:pass@kiosk.setservice.az/kiosk#capability=token',
      'https://qr.setservice.az/kiosk?redirect=https://evil.test#capability=token',
      'https://kiosk.setservice.az/kiosk?next=/anything#capability=token',
      'https://kiosk.setservice.az/kiosk#capability=token&next=evil',
      'https://kiosk.setservice.az/kiosk#capability=token%26next=evil',
      'https://kiosk.setservice.az/kiosk#capability=token=extra',
      'https://kiosk.setservice.az/kiosk#capability=',
      'https://kiosk.setservice.az/kiosk#capability=token/extra',
      'https://kiosk.setservice.az/kiosk#capability=token+extra',
      'https://kiosk.setservice.az/kiosk#capability=token\n',
      'https://kiosk.setservice.az/kiosk#capability=token\u0000',
      'https://kiosk.setservice.az/kiosk#capability=token\u007f',
      'https://kiosk.setservice.az/other/../kiosk#capability=token',
      'https://kiosk.setservice.az/./kiosk#capability=token',
      'https://kiosk.setservice.az/%6biosk#capability=token',
      'https://kiosk.setservice.az/kiosk/#capability=token',
      'https://kiosk.setservice.az/kiosk/token',
      'https://kiosk.setservice.az/qr-kiosk/token',
      '/kiosk#capability=token',
      '//kiosk.setservice.az/kiosk#capability=token',
    ]) {
      expect(
        KioskUrlPolicy.resolveForBase(
          value,
          allowedBaseUrl: 'https://qr.setservice.az',
        ),
        isNull,
        reason: value,
      );
    }
  });

  test('rejects malformed configured bases without fallback', () {
    for (final configuredBase in [
      'http://qr.setservice.az',
      'https://user@qr.setservice.az',
      'https://qr.setservice.az?next=evil',
      'https://qr.setservice.az#capability=token',
      'https://qr.setservice.az/other/../',
      'https://qr.setservice.az/%2e',
      'https://qr.setservice.az\n',
      'https://qr.setservice.az:444',
      'https://qr.setservice.az/app',
      'https://kiosk.setservice.az:444',
      'https://kiosk.setservice.az/app',
      '',
    ]) {
      expect(
        KioskUrlPolicy.resolveForBase(
          'https://qr.setservice.az/kiosk#capability=token',
          allowedBaseUrl: configuredBase,
        ),
        isNull,
        reason: configuredBase,
      );
    }
  });
}
