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
  const designAspect = 1080 / 2338;

  testWidgets(
    'standard iPhone shows one complete centered composition inside SafeArea',
    (tester) async {
      _setViewport(
        tester,
        const Size(390, 844),
        padding: const FakeViewPadding(top: 44, bottom: 34),
      );

      await _pumpRoleScreen(tester);

      final artwork = find.byKey(const ValueKey('role-selection-artwork'));
      final artworkRect = tester.getRect(artwork);
      final expectedHeight = 844 - 44 - 34;

      expect(find.byKey(const ValueKey('role-selection-scroll')), findsNothing);
      expect(
        find.byKey(const ValueKey('role-selection-background-image')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('role-selection-contact-mask')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('role-selection-contact-footer')),
        findsNothing,
      );
      expect(artworkRect.height, closeTo(expectedHeight, 0.1));
      expect(
        artworkRect.width / artworkRect.height,
        closeTo(designAspect, 0.001),
      );
      expect(artworkRect.top, greaterThanOrEqualTo(44));
      expect(artworkRect.bottom, lessThanOrEqualTo(810.1));
      expect(artworkRect.center.dx, closeTo(195, 0.1));
      _expectContactTextRenderedOnce();
      _expectNoException(tester, const Size(390, 844));
    },
  );

  for (final size in const [Size(320, 480), Size(320, 568)]) {
    testWidgets(
      'short phone uses readable controlled scrolling at ${size.width}x${size.height}',
      (tester) async {
        _setViewport(tester, size);
        await _pumpRoleScreen(tester);

        final scroll = find.byKey(const ValueKey('role-selection-scroll'));
        final artwork = find.byKey(const ValueKey('role-selection-artwork'));
        expect(scroll, findsOneWidget);
        expect(tester.getSize(artwork).width, closeTo(320, 0.1));
        expect(
          tester.getSize(artwork).height,
          closeTo(320 / designAspect, 0.1),
        );
        final scrollable = tester.state<ScrollableState>(
          find.descendant(of: scroll, matching: find.byType(Scrollable)),
        );
        expect(scrollable.position.maxScrollExtent, greaterThan(0));

        await tester.scrollUntilVisible(
          find.byKey(const ValueKey('contact-instagram')),
          240,
          scrollable: find.descendant(
            of: scroll,
            matching: find.byType(Scrollable),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('contact-instagram')), findsOneWidget);
        _expectNoException(tester, size);
      },
    );
  }

  for (final size in const [
    Size(600, 960),
    Size(768, 1024),
    Size(1024, 1366),
  ]) {
    testWidgets(
      'tablet keeps the role composition centered and capped at ${size.width}x${size.height}',
      (tester) async {
        _setViewport(tester, size);
        await _pumpRoleScreen(tester);

        final artworkRect = tester.getRect(
          find.byKey(const ValueKey('role-selection-artwork')),
        );
        expect(artworkRect.width, lessThanOrEqualTo(430.1));
        expect(artworkRect.center.dx, closeTo(size.width / 2, 0.1));
        expect(
          artworkRect.width / artworkRect.height,
          closeTo(designAspect, 0.001),
        );
        expect(
          find.byKey(const ValueKey('role-selection-background-image')),
          findsOneWidget,
        );
        _expectNoException(tester, size);
      },
    );
  }

  for (final size in const [Size(568, 320), Size(844, 390)]) {
    testWidgets('short landscape remains readable with scrolling at $size', (
      tester,
    ) async {
      _setViewport(tester, size);
      await _pumpRoleScreen(tester);

      expect(
        find.byKey(const ValueKey('role-selection-scroll')),
        findsOneWidget,
      );
      expect(
        tester
            .getSize(find.byKey(const ValueKey('role-selection-artwork')))
            .width,
        closeTo(320, 0.1),
      );
      _expectNoException(tester, size);
    });
  }

  testWidgets('1024x768 landscape uses a centered readable composition', (
    tester,
  ) async {
    const size = Size(1024, 768);
    _setViewport(tester, size);
    await _pumpRoleScreen(tester);

    final artworkRect = tester.getRect(
      find.byKey(const ValueKey('role-selection-artwork')),
    );
    expect(find.byKey(const ValueKey('role-selection-scroll')), findsNothing);
    expect(artworkRect.width, greaterThanOrEqualTo(320));
    expect(artworkRect.width, lessThanOrEqualTo(430));
    expect(
      artworkRect.center,
      within(distance: 0.1, from: size.center(Offset.zero)),
    );
    _expectNoException(tester, size);
  });

  testWidgets(
    'worker and company hit targets remain functional when scrolled',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      final roleSession = RoleSessionController();
      addTearDown(roleSession.dispose);
      _setViewport(tester, const Size(320, 480));

      await tester.pumpWidget(
        ChangeNotifierProvider<RoleSessionController>.value(
          value: roleSession,
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const RoleSelectionScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.bySemanticsLabel(AppStrings.continueAsWorker));
      await tester.pumpAndSettle();
      expect(roleSession.activeRole, AppRole.worker);

      await tester.ensureVisible(
        find.bySemanticsLabel(AppStrings.continueAsCompany),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.bySemanticsLabel(AppStrings.continueAsCompany));
      await tester.pumpAndSettle();
      expect(roleSession.activeRole, AppRole.company);
      _expectNoException(tester, const Size(320, 480));
    },
  );

  testWidgets('contact cards are separate links with production URIs', (
    tester,
  ) async {
    _setViewport(tester, const Size(390, 844));
    final openedUris = <Uri>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: RoleSelectionScreen(
          launchExternalUri: (uri) async {
            openedUris.add(uri);
            return true;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    const expectedLinks = <String, String>{
      'contact-website': 'https://www.setservice.az',
      'contact-facebook': 'https://www.facebook.com/setservice.az/',
      'contact-phone': 'tel:+994702315151',
      'contact-instagram': 'https://www.instagram.com/setservice.az/',
    };

    for (final link in expectedLinks.entries) {
      final target = find.byKey(ValueKey(link.key));
      expect(target, findsOneWidget);
      final top = tester.getTopLeft(target);
      final bottom = tester.getBottomRight(target);
      expect(bottom.dy - top.dy, greaterThanOrEqualTo(44), reason: link.key);
      await tester.tap(target);
      await tester.pump();
      expect(openedUris.last.toString(), link.value);
    }

    _expectContactTextRenderedOnce();
    _expectNoException(tester, const Size(390, 844));
  });

  for (final scale in const [1.3, 2.0]) {
    testWidgets('role composition has no overflow at ${scale}x text scale', (
      tester,
    ) async {
      _setViewport(tester, const Size(390, 844));
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: const RoleSelectionScreen(),
        ),
      );
      await tester.pumpAndSettle();

      _expectContactTextRenderedOnce();
      _expectNoException(tester, const Size(390, 844));
    });
  }

  testWidgets('failed contact launch reports an error without leaving screen', (
    tester,
  ) async {
    _setViewport(tester, const Size(390, 844));
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: RoleSelectionScreen(launchExternalUri: (_) async => false),
      ),
    );

    await tester.tap(find.byKey(const ValueKey('contact-website')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text(AppStrings.contactLinkFailed), findsOneWidget);
    expect(find.byType(RoleSelectionScreen), findsOneWidget);
    _expectNoException(tester, const Size(390, 844));
  });
}

void _setViewport(
  WidgetTester tester,
  Size size, {
  FakeViewPadding padding = FakeViewPadding.zero,
}) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  tester.view.padding = padding;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPadding);
}

Future<void> _pumpRoleScreen(WidgetTester tester) async {
  await tester.pumpWidget(
    MaterialApp(theme: AppTheme.light(), home: const RoleSelectionScreen()),
  );
  await tester.pumpAndSettle();
}

void _expectContactTextRenderedOnce() {
  expect(find.text(AppStrings.website), findsOneWidget);
  expect(find.text(AppStrings.contactFacebook), findsOneWidget);
  expect(find.text(AppStrings.contactPhone), findsOneWidget);
  expect(find.text(AppStrings.contactInstagram), findsOneWidget);
}

void _expectNoException(WidgetTester tester, Size size) {
  expect(tester.takeException(), isNull, reason: '$size');
}
