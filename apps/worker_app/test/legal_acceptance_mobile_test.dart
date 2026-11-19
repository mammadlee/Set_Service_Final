import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/shared/legal_links.dart';
import 'package:worker_app/shared/widgets/legal_acceptance_checkbox.dart';

void main() {
  test('public legal links stay outside /v1 for both base URL forms', () {
    for (final base in [
      'https://api.setservice.az',
      'https://api.setservice.az/v1',
      'https://api.setservice.az/v1/',
    ]) {
      expect(
        LegalLinks.publicUrlFor(base, 'privacy').toString(),
        'https://api.setservice.az/privacy',
      );
      expect(
        LegalLinks.publicUrlFor(base, 'terms').toString(),
        'https://api.setservice.az/terms',
      );
      expect(
        LegalLinks.publicUrlFor(base, 'account-deletion').toString(),
        'https://api.setservice.az/account-deletion',
      );
    }
  });

  testWidgets('registration consent has visible Terms and Privacy links', (
    tester,
  ) async {
    var accepted = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => LegalAcceptanceCheckbox(
              value: accepted,
              onChanged: (value) => setState(() => accepted = value),
            ),
          ),
        ),
      ),
    );
    expect(find.text('İstifadə Qaydaları'), findsOneWidget);
    expect(find.text('Məxfilik Siyasəti'), findsOneWidget);
    expect(accepted, isFalse);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pump();
    expect(accepted, isTrue);
    expect(tester.takeException(), isNull);
  });
}
