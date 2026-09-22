import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/features/admin/presentation/admin_home_shell.dart';

void main() {
  for (final size in <Size>[
    const Size(320, 640),
    const Size(360, 800),
    const Size(390, 844),
    const Size(430, 932),
  ]) {
    testWidgets('Admin status and actions fit ${size.width.toInt()}px', (
      tester,
    ) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SafeArea(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const AdminStatusHeader(
                    title:
                        'Çox uzun müəssisə və sifariş adı — giriş-çıxış məlumatları',
                    status: 'pending_approval',
                    icon: Icons.business_outlined,
                  ),
                  const SizedBox(height: 20),
                  AdminActionGroup(
                    actions: [
                      OutlinedButton(
                        onPressed: () {},
                        child: const Text('İşçi profilinin təsdiqlənməsi'),
                      ),
                      OutlinedButton(
                        onPressed: () {},
                        child: const Text('Müəssisəni rədd et'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Çox uzun müəssisə'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Admin actions remain usable with larger text and keyboard', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(1.3),
            viewInsets: const EdgeInsets.only(bottom: 270),
          ),
          child: child!,
        ),
        home: Scaffold(
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const AdminStatusHeader(
                title: 'Təyinatların idarə edilməsi',
                status: 'partially_assigned',
              ),
              const SizedBox(height: 16),
              const TextField(
                decoration: InputDecoration(labelText: 'Axtarış'),
              ),
              const SizedBox(height: 16),
              AdminActionGroup(
                actions: [
                  FilledButton(onPressed: () {}, child: const Text('Təsdiqlə')),
                  OutlinedButton(
                    onPressed: () {},
                    child: const Text('Rədd et'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
