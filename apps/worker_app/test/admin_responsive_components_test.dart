import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/features/admin/presentation/admin_home_shell.dart';

void main() {
  for (final size in <Size>[
    const Size(320, 640),
    const Size(360, 800),
    const Size(390, 844),
    const Size(430, 932),
    const Size(640, 360),
    const Size(768, 1024),
    const Size(1024, 768),
    const Size(1440, 900),
  ]) {
    testWidgets(
      'Admin content fits ${size.width.toInt()}x${size.height.toInt()}',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: AdminPageFrame(
                child: ListView(
                  key: const ValueKey('admin-responsive-scroll'),
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
        expect(
          tester
              .getSize(find.byKey(const ValueKey('admin-responsive-scroll')))
              .width,
          lessThanOrEqualTo(960),
        );
        expect(tester.takeException(), isNull);
      },
    );
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
            textScaler: const TextScaler.linear(2),
            viewInsets: const EdgeInsets.only(bottom: 270),
          ),
          child: child!,
        ),
        home: Scaffold(
          body: AdminPageFrame(
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.all(16),
              children: [
                const AdminStatusHeader(
                  title:
                      'Təyinatların idarə edilməsi və uzun Azərbaycan dilində başlıq',
                  status: 'partially_assigned',
                ),
                const SizedBox(height: 16),
                const TextField(
                  decoration: InputDecoration(
                    labelText: 'İşçi və ya müəssisə üzrə axtarış',
                  ),
                ),
                const SizedBox(height: 16),
                AdminActionGroup(
                  actions: [
                    FilledButton(
                      onPressed: () {},
                      child: const Text('İşçini təsdiqlə'),
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
    await tester.scrollUntilVisible(
      find.text('Müəssisəni rədd et'),
      220,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    for (final button in find.byType(ButtonStyleButton).evaluate()) {
      expect(
        tester.getSize(find.byWidget(button.widget)).height,
        greaterThanOrEqualTo(44),
      );
    }
    expect(tester.takeException(), isNull);
  });
}
