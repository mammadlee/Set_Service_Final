import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worker_app/core/session/app_role.dart';
import 'package:worker_app/core/session/role_session_controller.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/features/role_selection/presentation/role_selection_screen.dart';
import 'package:worker_app/shared/app_strings.dart';

void main() {
  const designSize = Size(1080, 2338);
  const phoneSizes = <Size>[
    Size(320, 480),
    Size(320, 568),
    Size(360, 640),
    Size(375, 667),
    Size(375, 812),
    Size(390, 844),
    Size(412, 915),
    Size(430, 932),
  ];

  testWidgets(
    'opening role screen fills every tested phone and keeps artwork visible',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      for (final phoneSize in phoneSizes) {
        tester.view.physicalSize = phoneSize;
        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light(),
            home: const RoleSelectionScreen(),
          ),
        );
        await tester.pumpAndSettle();

        final artwork = find.byKey(const ValueKey('role-selection-artwork'));
        final edgeFill = find.byKey(const ValueKey('role-selection-edge-fill'));
        final scale = math.min(
          phoneSize.width / designSize.width,
          phoneSize.height / designSize.height,
        );
        final expectedSize = designSize * scale;
        final topLeft = tester.getTopLeft(artwork);
        final bottomRight = tester.getBottomRight(artwork);

        expect(find.byType(Scrollable), findsNothing, reason: '$phoneSize');
        expect(tester.getSize(edgeFill), phoneSize, reason: '$phoneSize');
        expect(tester.getTopLeft(edgeFill), Offset.zero, reason: '$phoneSize');
        expect(tester.getSize(artwork).width, closeTo(expectedSize.width, 0.1));
        expect(
          tester.getSize(artwork).height,
          closeTo(expectedSize.height, 0.1),
        );
        expect(topLeft.dx, greaterThanOrEqualTo(0), reason: '$phoneSize');
        expect(topLeft.dy, greaterThanOrEqualTo(0), reason: '$phoneSize');
        expect(
          bottomRight.dx,
          lessThanOrEqualTo(phoneSize.width + 0.1),
          reason: '$phoneSize',
        );
        expect(
          bottomRight.dy,
          lessThanOrEqualTo(phoneSize.height + 0.1),
          reason: '$phoneSize',
        );
        expect(tester.takeException(), isNull, reason: '$phoneSize');
      }
    },
  );

  testWidgets('opening artwork stays centered on a wide display', (
    tester,
  ) async {
    const displaySize = Size(1024, 700);
    tester.view.physicalSize = displaySize;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(theme: AppTheme.light(), home: const RoleSelectionScreen()),
    );
    await tester.pumpAndSettle();

    final artwork = find.byKey(const ValueKey('role-selection-artwork'));
    final artworkRect = tester.getRect(artwork);
    expect(find.byType(Scrollable), findsNothing);
    expect(
      artworkRect.center,
      within(distance: 0.1, from: displaySize.center(Offset.zero)),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('scaled worker and company hit targets remain functional', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    final roleSession = RoleSessionController();
    addTearDown(roleSession.dispose);
    tester.view.physicalSize = const Size(320, 480);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ChangeNotifierProvider<RoleSessionController>.value(
        value: roleSession,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const RoleSelectionScreen(),
        ),
      ),
    );

    await tester.tap(
      find.bySemanticsLabel(AppStrings.continueAsWorker),
      warnIfMissed: true,
    );
    await tester.pumpAndSettle();
    expect(roleSession.activeRole, AppRole.worker);

    await tester.tap(
      find.bySemanticsLabel(AppStrings.continueAsCompany),
      warnIfMissed: true,
    );
    await tester.pumpAndSettle();
    expect(roleSession.activeRole, AppRole.company);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'opening artwork respects notches and gesture navigation insets',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      tester.view.padding = const FakeViewPadding(top: 44, bottom: 34);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPadding);

      await tester.pumpWidget(
        MaterialApp(theme: AppTheme.light(), home: const RoleSelectionScreen()),
      );
      await tester.pumpAndSettle();

      final artwork = find.byKey(const ValueKey('role-selection-artwork'));
      final artworkRect = tester.getRect(artwork);
      expect(find.byType(Scrollable), findsNothing);
      expect(artworkRect.top, greaterThanOrEqualTo(44));
      expect(artworkRect.bottom, lessThanOrEqualTo(810));
      expect(tester.takeException(), isNull);
    },
  );
}
