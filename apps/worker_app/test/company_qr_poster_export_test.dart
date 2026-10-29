import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/features/company/services/qr_poster_exporter.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final poster = QrPosterData(
    stableUrl:
        'https://qr.setservice.az/kiosk#capability=stable-order-capability',
    orderId: 'order/with unsafe spaces',
    orderTitle: 'Beynəlxalq tədbir sifarişi',
    companyName: 'SET Service tərəfdaşı',
    location: 'Bakı şəhəri, Nəsimi rayonu',
    schedule: '18.06.2026 10:00 - 18:00',
  );

  test('poster QR payload remains the stable kiosk page URL', () {
    expect(poster.qrPayload, poster.stableUrl);
    expect(poster.qrPayload, contains('/kiosk#capability='));
    expect(poster.qrPayload, isNot(contains('qr_token')));
    expect(poster.printablePageUrl, 'https://qr.setservice.az/kiosk');
    expect(poster.fileStem, 'set-service-qr-order-with-unsafe-spaces');
  });

  test('poster rejects a non-whitelisted or non-kiosk URL', () {
    expect(
      () => QrPosterData(
        stableUrl: 'https://evil.example.test/kiosk#capability=token',
        orderId: 'order-1',
        orderTitle: 'Sifariş',
        companyName: 'Müəssisə',
        location: 'Bakı',
      ),
      throwsArgumentError,
    );
    expect(
      () => QrPosterData(
        stableUrl: 'https://qr.setservice.az/kiosk#capability=',
        orderId: 'order-1',
        orderTitle: 'Sifariş',
        companyName: 'Müəssisə',
        location: 'Bakı',
      ),
      throwsArgumentError,
    );
  });

  testWidgets('PNG poster is encoded with the SET Service QR payload', (
    tester,
  ) async {
    final bytes = (await tester.runAsync(
      () => QrPosterExporter.buildPng(poster),
    ))!;
    expect(bytes, isA<Uint8List>());
    expect(bytes.length, greaterThan(20 * 1024));
    expect(bytes.sublist(0, 8), <int>[137, 80, 78, 71, 13, 10, 26, 10]);
  });

  testWidgets('PDF poster is generated with a stable QR and safe warning', (
    tester,
  ) async {
    final bytes = (await tester.runAsync(
      () => QrPosterExporter.buildPdf(poster),
    ))!;
    expect(bytes, isA<Uint8List>());
    expect(bytes.length, greaterThan(4 * 1024));
    expect(String.fromCharCodes(bytes.take(4)), '%PDF');
    expect(String.fromCharCodes(bytes.take(200)), contains('%PDF'));
  });
}
