import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/shared/widgets/premium_components.dart';

void main() {
  testWidgets('premium bottom sheet stays scrollable with the keyboard open', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 480);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 180);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showPremiumBottomSheet<void>(
                  context: context,
                  title: 'Əlaqə məlumatları',
                  child: Column(
                    children: List.generate(
                      8,
                      (index) => const Padding(
                        padding: EdgeInsets.only(bottom: 12),
                        child: TextField(),
                      ),
                    ),
                  ),
                ),
                child: const Text('Aç'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Aç'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byType(SingleChildScrollView), findsWidgets);
  });

  testWidgets('premium chip constrains a long label', (tester) async {
    tester.view.physicalSize = const Size(180, 120);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 100,
              child: const PremiumChip(
                label: 'Çox uzun status mətni daşmamalıdır',
                icon: Icons.verified_outlined,
              ),
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
  });
}
