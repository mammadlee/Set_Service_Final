import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/push/push_notification_service.dart';
import 'package:worker_app/core/push/push_registration_service.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/features/company/data/company_repository.dart';
import 'package:worker_app/features/company/presentation/company_auth_controller.dart';
import 'package:worker_app/features/attendance/data/models/attendance.dart';
import 'package:worker_app/features/company/presentation/company_home_shell.dart';
import 'package:worker_app/features/company/presentation/company_strings.dart';
import 'package:worker_app/features/taxonomy/data/taxonomy_repository.dart';
import 'package:worker_app/shared/app_strings.dart';
import 'package:worker_app/shared/models/mobile_models.dart';
import 'package:worker_app/shared/widgets/loading_button.dart';

const _department = 'Qonaqlara xidmət və beynəlxalq tədbirlərin təşkili şöbəsi';
const _subdepartment = 'Restoran və böyük tədbirlərin banket xidməti';
const _position = 'Beynəlxalq tədbirlər üzrə baş ofisiant köməkçisi';
const _address =
    'Bakı şəhəri, Nəsimi rayonu, Üzeyir Hacıbəyli küçəsi 123, üçüncü mərtəbə, böyük tədbirlər zalının xidməti girişi';
const _canonicalKioskUrl =
    'https://qr.setservice.az/kiosk#capability=private-test-capability';

void main() {
  testWidgets(
    'returning to cached active orders shows a new published order with zero assignments',
    (tester) async {
      final fixture = _Fixture()..orderCreated = false;
      addTearDown(fixture.dispose);
      _size(tester, 390);
      await tester.pumpWidget(fixture.wrap(const CompanyHomeShell()));
      // The dashboard has a continuously animated hero; pump bounded frames.
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.byType(NavigationDestination).at(1));
      await tester.pumpAndSettle();
      expect(find.text('Hələ sifariş yoxdur.'), findsOneWidget);
      await tester.tap(find.byType(NavigationDestination).at(0));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      // A create from another screen must invalidate the previously visited list.
      final created = await tester.runAsync(
        () => fixture.repo.createOrder(
          title: 'Yeni sifariş',
          description: 'Banket xidməti',
          categoryItems: [
            CreateOrderCategoryInput(
              category: _position,
              requiredCount: 2,
              departmentId: 'department-1',
              subdepartmentId: 'subdepartment-1',
              positionId: 'position-1',
            ),
          ],
          start: DateTime.now().add(const Duration(days: 2)),
          end: DateTime.now().add(const Duration(days: 3)),
          location: _address,
        ),
      );
      expect(created?.status, 'published');
      expect(created?.assignmentCount, 0);
      final previousGets = fixture.requests
          .where((r) => r.path == '/orders' && r.method == 'GET')
          .length;
      await tester.tap(find.byType(NavigationDestination).at(1));
      await tester.pumpAndSettle();
      expect(find.text(_order()['title'] as String), findsOneWidget);
      expect(find.text('Hələ sifariş yoxdur.'), findsNothing);
      final gets = fixture.requests
          .where((r) => r.path == '/orders' && r.method == 'GET')
          .toList();
      expect(gets.length, greaterThan(previousGets));
      expect(gets.every((r) => r.queryParameters['scope'] == 'active'), isTrue);
      expect(
        gets.every((r) => !r.queryParameters.containsKey('status')),
        isTrue,
      );
      await _chooseOrderFilter(tester, AppStrings.allOrders);
      expect(
        fixture.requests.last.queryParameters.containsKey('scope'),
        isFalse,
      );
      await _chooseOrderFilter(tester, AppStrings.activeOrders);
      expect(fixture.requests.last.queryParameters['scope'], 'active');
      expect(find.text(_order()['title'] as String), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  test(
    'company attendance keeps worker/order context from the existing API',
    () {
      final log = AttendanceLog.fromJson({
        'assignment_id': 'assignment-1',
        'assignment': {
          'worker': {'name': 'Rəna Əliyeva'},
          'order': {'title': 'Banket xidməti'},
        },
      });
      expect(log.workerName, 'Rəna Əliyeva');
      expect(log.orderTitle, 'Banket xidməti');
      expect(log.assignmentId, 'assignment-1');
      expect(AttendanceLog.fromJson({}).workerName, isNull);
    },
  );

  testWidgets(
    'workplace address keeps focus and text when iOS keyboard insets rebuild the form',
    (tester) async {
      final fixture = _Fixture();
      addTearDown(fixture.dispose);
      _size(tester, 390, height: 844);
      await tester.pumpWidget(fixture.wrap(const CompanyCreateOrderScreen()));
      await tester.pumpAndSettle();

      await _select(tester, CompanyStrings.chooseDepartment, _department);
      await _next(tester);
      await _select(tester, CompanyStrings.chooseSubdepartment, _subdepartment);
      await _next(tester);
      await _select(tester, CompanyStrings.choosePosition, _position);
      await _next(tester);
      await _next(tester);
      await _date(
        tester,
        AppStrings.starts,
        DateTime.now().add(const Duration(days: 2)),
      );
      await _date(
        tester,
        AppStrings.ends,
        DateTime.now().add(const Duration(days: 3)),
      );
      await _next(tester);

      final addressField = find.widgetWithText(
        TextFormField,
        CompanyStrings.address,
      );
      expect(addressField, findsOneWidget);
      await tester.tap(addressField);
      await tester.pump();

      Finder editable() => find.descendant(
        of: addressField,
        matching: find.byType(EditableText),
      );
      final stateBeforeKeyboardInset = tester.state<EditableTextState>(
        editable(),
      );
      expect(stateBeforeKeyboardInset.widget.focusNode.hasFocus, isTrue);
      expect(tester.testTextInput.isVisible, isTrue);

      const firstPart = 'Bakı şəhəri, Nəsimi rayonu';
      await tester.enterText(addressField, firstPart);
      await tester.pump();
      expect(
        tester.widget<EditableText>(editable()).controller.text,
        firstPart,
      );

      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pump();

      final stateAfterKeyboardInset = tester.state<EditableTextState>(
        editable(),
      );
      expect(
        identical(stateAfterKeyboardInset, stateBeforeKeyboardInset),
        isTrue,
      );
      expect(stateAfterKeyboardInset.widget.focusNode.hasFocus, isTrue);
      expect(tester.testTextInput.isVisible, isTrue);
      expect(
        tester.widget<EditableText>(editable()).controller.text,
        firstPart,
      );

      await tester.enterText(addressField, _address);
      await tester.pump();
      expect(tester.widget<EditableText>(editable()).controller.text, _address);
      expect(
        tester.widget<EditableText>(editable()).focusNode.hasFocus,
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );

  const orderViewports = <Size>[
    Size(320, 568),
    Size(360, 800),
    Size(375, 667),
    Size(390, 844),
    Size(430, 900),
    Size(600, 960),
    Size(844, 390),
    Size(768, 1024),
    Size(1024, 768),
  ];
  for (final viewport in orderViewports) {
    testWidgets('company order form creates once with long values at '
        '${viewport.width}x${viewport.height}', (tester) async {
      final fixture = _Fixture();
      addTearDown(fixture.dispose);
      _size(tester, viewport.width, height: viewport.height);
      MobileOrder? created;
      await tester.pumpWidget(
        fixture.wrap(
          Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  created = await Navigator.of(context).push<MobileOrder>(
                    MaterialPageRoute(
                      builder: (_) => const CompanyCreateOrderScreen(),
                    ),
                  );
                },
                child: const Text('Open form'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open form'));
      await tester.pumpAndSettle();
      expect(find.text(CompanyStrings.chooseDepartment), findsOneWidget);
      await _select(tester, CompanyStrings.chooseDepartment, _department);
      expect(find.text(CompanyStrings.chooseDepartment), findsNothing);
      expect(find.text(_department), findsOneWidget);
      expect(tester.takeException(), isNull);
      await _next(tester);
      expect(find.text(CompanyStrings.chooseSubdepartment), findsOneWidget);
      await _select(tester, CompanyStrings.chooseSubdepartment, _subdepartment);
      expect(find.text(CompanyStrings.chooseSubdepartment), findsNothing);
      await _next(tester);
      expect(find.text(CompanyStrings.choosePosition), findsOneWidget);
      await _select(tester, CompanyStrings.choosePosition, _position);
      expect(find.text(CompanyStrings.choosePosition), findsNothing);
      await _next(tester);
      await _next(tester);
      await _date(
        tester,
        AppStrings.starts,
        DateTime.now().add(const Duration(days: 2)),
      );
      await _date(
        tester,
        AppStrings.ends,
        DateTime.now().add(const Duration(days: 3)),
      );
      await _next(tester);
      expect(find.text(CompanyStrings.addressHint), findsOneWidget);
      await tester.enterText(find.byType(TextFormField), _address);
      tester.view.viewInsets = const FakeViewPadding(bottom: 220);
      await tester.pump();
      await tester.ensureVisible(find.text('Davam et'));
      await tester.pumpAndSettle();
      expect(find.text('Davam et'), findsOneWidget);
      expect(tester.takeException(), isNull);
      tester.view.resetViewInsets();
      await _next(tester);
      expect(find.text(CompanyStrings.addressHint), findsNothing);
      final submit = find.widgetWithText(LoadingButton, AppStrings.createOrder);
      await _revealOrderAction(tester, submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(find.text(AppStrings.requiredField), findsNWidgets(2));
      expect(tester.takeException(), isNull);
      await tester.enterText(
        find.byType(TextFormField).at(0),
        'İllik beynəlxalq tədbir',
      );
      await tester.enterText(
        find.byType(TextFormField).at(1),
        'Qonaqların qarşılanması və tədbir boyu banket xidməti.',
      );
      await _revealOrderAction(tester, submit);
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(
        created?.id,
        'order-1',
        reason: tester
            .widgetList<Text>(find.byType(Text))
            .map((text) => text.data)
            .join(' | '),
      );
      final posts = fixture.requests
          .where((r) => r.path == '/orders' && r.method == 'POST')
          .toList();
      expect(posts, hasLength(1));
      expect((posts.single.data as Map)['location'], _address);
      expect(
        ((posts.single.data as Map)['category_items'] as List)
            .single['department_id'],
        'department-1',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('company detail and QR states fit long content at '
        '${viewport.width}x${viewport.height}', (tester) async {
      final fixture = _Fixture();
      addTearDown(fixture.dispose);
      _size(tester, viewport.width, height: viewport.height);
      await tester.pumpWidget(
        fixture.wrap(const CompanyOrderDetailRoute(orderId: 'order-1')),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(
        find.text(CompanyStrings.createQr),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text(CompanyStrings.createQr), findsOneWidget);
      await tester.ensureVisible(find.text(CompanyStrings.createQr));
      await tester.pumpAndSettle();
      await tester.tap(find.text(CompanyStrings.createQr));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text(CompanyStrings.qrOpen),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      expect(find.text(CompanyStrings.qrOpen), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text(CompanyStrings.qrShare),
        160,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      expect(find.text(CompanyStrings.qrShare), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text(CompanyStrings.qrExportPng),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      expect(find.text(CompanyStrings.qrExportPng), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text(CompanyStrings.qrExportPdf),
        160,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      expect(find.text(CompanyStrings.qrExportPdf), findsOneWidget);
      expect(find.textContaining('capability='), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text(CompanyStrings.viewQr), findsOneWidget);
      expect(
        fixture.requests.where(
          (r) => r.path == '/attendance/venue-kiosks' && r.method == 'POST',
        ),
        hasLength(1),
      );
    });
  }

  testWidgets(
    'company order selector keeps empty and long selected text distinct at 320px with scaled text',
    (tester) async {
      final fixture = _Fixture();
      addTearDown(fixture.dispose);
      _size(tester, 320, height: 568);
      await tester.pumpWidget(
        fixture.wrap(
          const CompanyCreateOrderScreen(),
          textScaler: const TextScaler.linear(1.3),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(CompanyStrings.chooseDepartment), findsOneWidget);
      expect(find.text(_department), findsNothing);
      expect(tester.takeException(), isNull);

      await _select(tester, CompanyStrings.chooseDepartment, _department);
      expect(find.text(CompanyStrings.chooseDepartment), findsNothing);
      expect(find.text(_department), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  for (final viewport in const <Size>[
    Size(360, 800),
    Size(844, 390),
    Size(768, 1024),
    Size(1024, 768),
  ]) {
    testWidgets('company shell tabs and more menu remain usable at '
        '${viewport.width}x${viewport.height}', (tester) async {
      final fixture = _Fixture();
      addTearDown(fixture.dispose);
      _size(tester, viewport.width, height: viewport.height);
      await tester.pumpWidget(fixture.wrap(const CompanyHomeShell()));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Test müəssisə'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.byIcon(Icons.assignment_outlined));
      await tester.pumpAndSettle();
      if (viewport.width < 560) {
        expect(
          find.byWidgetPredicate((widget) => widget is DropdownButtonFormField),
          findsOneWidget,
        );
      } else {
        expect(
          find.byWidgetPredicate((widget) => widget is SegmentedButton),
          findsOneWidget,
        );
      }
      expect(tester.takeException(), isNull);

      await tester.tap(find.byIcon(Icons.groups_outlined));
      await tester.pumpAndSettle();
      expect(find.text(AppStrings.noAssignments), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.byIcon(Icons.notifications_outlined));
      await tester.pumpAndSettle();
      expect(find.text(AppStrings.noNotifications), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.byIcon(Icons.menu_rounded));
      await tester.pumpAndSettle();
      expect(find.text('Giriş-çıxış'), findsOneWidget);
      expect(find.text('Hesabat'), findsOneWidget);
      expect(find.text('Məxfilik və hesab'), findsOneWidget);
      expect(find.text('Hesabdan çıx'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.text('Giriş-çıxış'));
      await tester.pumpAndSettle();
      expect(find.text('Hələ məlumat yoxdur'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  test(
    'QR creation reuses existing active screen and trusts backend eligibility',
    () async {
      final fixture = _Fixture()..existing = true;
      addTearDown(fixture.dispose);
      final kiosk = await fixture.repo.createOrderQr(
        MobileOrder.fromJson(_order()),
      );
      expect(kiosk.id, 'kiosk-1');
      expect(fixture.requests.where((r) => r.method == 'POST'), isEmpty);
      // Recreating the repository simulates an app restart: the association
      // must come back from the backend, not from a local-only cache.
      final reopenedRepository = CompanyRepository(
        apiClient: fixture.client,
        tokenStorage: fixture.storage,
      );
      final reopened = await reopenedRepository.getOrderQrState('order-1');
      expect(reopened.kiosks.single.orderId, 'order-1');
      expect(reopened.kiosks.single.kioskUrl, contains('/kiosk#capability='));
      fixture.eligible = false;
      await expectLater(
        fixture.repo.createOrderQr(MobileOrder.fromJson(_order())),
        throwsA(isA<Exception>()),
      );
      expect(fixture.requests.where((r) => r.method == 'POST'), isEmpty);
    },
  );

  for (final host in ['qr.setservice.az', 'kiosk.setservice.az']) {
    testWidgets(
      'existing active QR from $host opens copies and shares canonical URL on narrow iPhone',
      (tester) async {
        final fixture = _Fixture()
          ..existing = true
          ..kioskUrl = 'https://$host/kiosk#capability=private-test-capability';
        addTearDown(fixture.dispose);
        _size(tester, 390, height: 844);
        final launched = <String>[];
        final shared = <String>[];
        String? clipboardValue;
        const launchChannel = MethodChannel('plugins.flutter.io/url_launcher');
        const shareChannel = MethodChannel('dev.fluttercommunity.plus/share');
        final messenger = tester.binding.defaultBinaryMessenger;
        messenger.setMockMethodCallHandler(launchChannel, (call) async {
          expect(call.method, 'launch');
          launched.add((call.arguments as Map)['url'] as String);
          expect((call.arguments as Map)['useSafariVC'], isFalse);
          return true;
        });
        messenger.setMockMethodCallHandler(shareChannel, (call) async {
          expect(call.method, 'share');
          shared.add((call.arguments as Map)['uri'] as String);
          return 'shared';
        });
        messenger.setMockMethodCallHandler(SystemChannels.platform, (
          call,
        ) async {
          if (call.method == 'Clipboard.setData') {
            clipboardValue = (call.arguments as Map)['text'] as String?;
            return null;
          }
          if (call.method == 'Clipboard.getData') {
            return {'text': clipboardValue};
          }
          return null;
        });
        addTearDown(() {
          messenger.setMockMethodCallHandler(launchChannel, null);
          messenger.setMockMethodCallHandler(shareChannel, null);
          messenger.setMockMethodCallHandler(SystemChannels.platform, null);
        });

        await tester.pumpWidget(
          fixture.wrap(const CompanyOrderDetailRoute(orderId: 'order-1')),
        );
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text(CompanyStrings.viewQr),
          300,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.ensureVisible(find.text(CompanyStrings.viewQr));
        await tester.pumpAndSettle();
        await tester.tap(find.text(CompanyStrings.viewQr));
        await tester.pumpAndSettle();

        // This is the active-but-blocked screen seen on the real iPhone.
        // Labels alone are insufficient: invoke the enabled actions and check
        // what actually leaves Flutter via each platform channel.
        for (final label in [
          CompanyStrings.qrOpen,
          CompanyStrings.qrCopy,
          CompanyStrings.qrShare,
        ]) {
          await tester.scrollUntilVisible(
            find.text(label),
            160,
            scrollable: find.byType(Scrollable).last,
          );
          await tester.pumpAndSettle();
          final button = find.ancestor(
            of: find.text(label),
            matching: find.byWidgetPredicate((w) => w is ButtonStyleButton),
          );
          expect(tester.widget<ButtonStyleButton>(button).onPressed, isNotNull);
          expect(find.text(AppStrings.kioskUrlBlocked), findsNothing);
          await tester.ensureVisible(find.text(label));
          await tester.pumpAndSettle();
          await tester.tap(find.text(label));
          await tester.pumpAndSettle();
        }
        expect(launched, [_canonicalKioskUrl]);
        expect(shared, [_canonicalKioskUrl]);
        expect(clipboardValue, _canonicalKioskUrl);
        expect(fixture.requests.where((r) => r.method == 'POST'), isEmpty);
        expect(tester.takeException(), isNull);

        // The same persisted kiosk is still usable when the order is reopened.
        await tester.pageBack();
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text(CompanyStrings.viewQr));
        await tester.pumpAndSettle();
        await tester.tap(find.text(CompanyStrings.viewQr));
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text(CompanyStrings.qrOpen),
          160,
          scrollable: find.byType(Scrollable).last,
        );
        await tester.pumpAndSettle();
        expect(find.text(AppStrings.kioskUrlBlocked), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final unsafeUrl in [
    'https://attacker.example/kiosk#capability=private-test-capability',
    'http://qr.setservice.az/kiosk#capability=private-test-capability',
    'https://qr.setservice.az/kiosk/kiosk#capability=private-test-capability',
  ]) {
    testWidgets('active QR with unsafe URL stays blocked: $unsafeUrl', (
      tester,
    ) async {
      final fixture = _Fixture()
        ..existing = true
        ..kioskUrl = unsafeUrl;
      addTearDown(fixture.dispose);
      _size(tester, 390, height: 844);
      await tester.pumpWidget(
        fixture.wrap(const CompanyOrderDetailRoute(orderId: 'order-1')),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text(CompanyStrings.viewQr),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text(CompanyStrings.viewQr));
      await tester.pumpAndSettle();
      await tester.tap(find.text(CompanyStrings.viewQr));
      await tester.pumpAndSettle();
      for (final label in [
        CompanyStrings.qrOpen,
        CompanyStrings.qrCopy,
        CompanyStrings.qrShare,
        CompanyStrings.qrExportPng,
        CompanyStrings.qrExportPdf,
      ]) {
        await tester.scrollUntilVisible(
          find.text(label),
          160,
          scrollable: find.byType(Scrollable).last,
        );
        final button = find.ancestor(
          of: find.text(label),
          matching: find.byWidgetPredicate((w) => w is ButtonStyleButton),
        );
        await tester.ensureVisible(find.text(label));
        await tester.pumpAndSettle();
        expect(tester.widget<ButtonStyleButton>(button).onPressed, isNull);
      }
      expect(fixture.requests.where((r) => r.method == 'POST'), isEmpty);
      expect(tester.takeException(), isNull);
    });
  }

  test(
    'concurrent QR creation coalesces and failed activation retries same kiosk',
    () async {
      final fixture = _Fixture()..failActivation = true;
      addTearDown(fixture.dispose);
      final order = MobileOrder.fromJson(_order());
      final first = fixture.repo.createOrderQr(order);
      final second = fixture.repo.createOrderQr(order);
      expect(identical(first, second), isTrue);
      await expectLater(first, throwsA(isA<Exception>()));
      fixture.failActivation = false;
      await fixture.repo.createOrderQr(order);
      expect(
        fixture.requests.where(
          (r) => r.path == '/attendance/venue-kiosks' && r.method == 'POST',
        ),
        hasLength(1),
      );
      expect(
        fixture.requests.where((r) => r.path.endsWith('/activate')),
        hasLength(2),
      );
    },
  );

  testWidgets('ineligible order never exposes QR create action', (
    tester,
  ) async {
    final fixture = _Fixture()..eligible = false;
    addTearDown(fixture.dispose);
    _size(tester, 360);
    await tester.pumpWidget(
      fixture.wrap(
        Scaffold(
          body: ListView(
            children: [
              CompanyOrderQrCard(order: MobileOrder.fromJson(_order())),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(CompanyStrings.qrUnavailable), findsOneWidget);
    expect(find.text(CompanyStrings.createQr), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

void _size(WidgetTester tester, double width, {double height = 820}) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, height);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetViewInsets);
}

Future<void> _select(WidgetTester tester, String prompt, String value) async {
  await tester.tap(find.text(prompt));
  await tester.pumpAndSettle();
  await tester.tap(find.text(value));
  await tester.pumpAndSettle();
}

Future<void> _chooseOrderFilter(WidgetTester tester, String label) async {
  final dropdown = find.byWidgetPredicate(
    (widget) => widget is DropdownButtonFormField,
  );
  await tester.tap(dropdown);
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

Future<void> _next(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Davam et'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Davam et'));
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
}

Future<void> _revealOrderAction(WidgetTester tester, Finder action) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pump();
  final formScroll = find.byKey(const ValueKey('company-order-form-scroll'));
  if (formScroll.evaluate().isNotEmpty) {
    final scrollable = find
        .descendant(of: formScroll, matching: find.byType(Scrollable))
        .first;
    final position = tester.state<ScrollableState>(scrollable).position;
    position.jumpTo(position.maxScrollExtent);
    await tester.pumpAndSettle();
    return;
  }
  await tester.ensureVisible(action);
  await tester.pumpAndSettle();
}

Future<void> _date(WidgetTester tester, String label, DateTime date) async {
  await tester.tap(find.widgetWithText(TextFormField, label));
  await tester.pumpAndSettle();
  tester
      .widget<CalendarDatePicker>(find.byType(CalendarDatePicker))
      .onDateChanged(date);
  await tester.pump();
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
}

Map<String, dynamic> _order() => {
  'id': 'order-1',
  'title': 'Uzun adlı beynəlxalq tədbir üçün müəssisə sifarişi',
  'description': 'Qonaqların qarşılanması və banket xidməti.',
  'category': _position,
  'status': 'published',
  'required_count': 2,
  'assignment_count': 0,
  'location': _address,
  'start_datetime': DateTime.now()
      .add(const Duration(days: 2))
      .toIso8601String(),
  'end_datetime': DateTime.now().add(const Duration(days: 3)).toIso8601String(),
  'category_items': [
    {
      'id': 'category-1',
      'category': _position,
      'required_count': 2,
      'assigned_count': 0,
      'department': {'name_az': _department},
      'subdepartment': {'name_az': _subdepartment},
      'position': {'name_az': _position},
    },
  ],
};

class _Fixture {
  _Fixture() {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
    dio.httpClientAdapter = _Adapter(_handle);
    client = ApiClient(
      baseUrl: 'https://example.test/v1',
      tokenStorage: storage,
      expectedRole: 'company',
      sessionCoordinator: coordinator,
      dioOverride: dio,
      refreshDioOverride: Dio(),
    );
    repo = CompanyRepository(apiClient: client, tokenStorage: storage);
  }
  final coordinator = SessionCoordinator();
  final storage = _Storage();
  final requests = <RequestOptions>[];
  late final ApiClient client;
  late final CompanyRepository repo;
  bool eligible = true;
  bool existing = false;
  bool failActivation = false;
  bool orderCreated = true;
  String? kioskUrl = _canonicalKioskUrl;

  Widget wrap(Widget home, {TextScaler? textScaler}) => MultiProvider(
    providers: [
      ChangeNotifierProvider<CompanyAuthController>(
        create: (_) => CompanyAuthController(
          repo,
          PushRegistrationService(
            apiClient: client,
            pushNotificationService: PushNotificationService(),
          ),
          coordinator,
        ),
      ),
      Provider<CompanyRepository>.value(value: repo),
      Provider<TaxonomyRepository>.value(
        value: TaxonomyRepository(apiClient: client),
      ),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      builder: textScaler == null
          ? null
          : (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: textScaler),
              child: child!,
            ),
      home: home,
    ),
  );

  Future<ResponseBody> _handle(RequestOptions options) async {
    requests.add(options);
    if (options.path == '/taxonomy') {
      return _response({
        'data': [
          {
            'id': 'department-1',
            'name_az': _department,
            'subdepartments': [
              {
                'id': 'subdepartment-1',
                'name_az': _subdepartment,
                'positions': [
                  {'id': 'position-1', 'name_az': _position},
                ],
              },
            ],
          },
        ],
      });
    }
    if (options.path == '/companies/me') {
      return _response({
        'id': 'company-1',
        'name': 'Test müəssisə',
        'status': 'approved',
      });
    }
    if (options.path == '/orders' && options.method == 'GET') {
      return _response({
        'data': orderCreated ? [_order()] : [],
        'meta': {'page': 1, 'total_pages': 1},
      });
    }
    if (options.path == '/orders' || options.path == '/orders/order-1') {
      orderCreated = true;
      return _response(_order());
    }
    if (options.path == '/attendance/venue-kiosks/eligible-orders') {
      return _response({
        'data': eligible ? [_order()] : [],
      });
    }
    if (options.path == '/attendance/venue-kiosks') {
      if (options.method == 'POST') return _response(_kiosk(false));
      return _response({
        'data': existing ? [_kiosk(true)] : [],
      });
    }
    if (options.path.endsWith('/activate')) {
      if (failActivation) {
        return _response({
          'error': 'Sifariş yenidən yoxlanılmalıdır.',
        }, status: 409);
      }
      existing = true;
      return _response(_kiosk(true));
    }
    return _response({'data': []});
  }

  Map<String, dynamic> _kiosk(bool active) => {
    'id': 'kiosk-1',
    'name': 'İş yerinin əsas giriş QR ekranı',
    'status': 'active',
    'company_name': 'Test müəssisə',
    'active_session': active ? {'order_id': 'order-1'} : null,
    'kiosk_url': kioskUrl,
  };
  Future<void> dispose() => coordinator.dispose();
}

ResponseBody _response(Map<String, dynamic> data, {int status = 200}) =>
    ResponseBody.fromString(
      jsonEncode(data),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions) handler;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => handler(options);
  @override
  void close({bool force = false}) {}
}

class _Storage implements TokenStorage {
  @override
  bool get isLoaded => true;
  @override
  String? get cachedAccessToken => null;
  @override
  String? get cachedRefreshToken => null;
  @override
  Future<void> clear() async {}
  @override
  Future<String?> readAccessToken() async => null;
  @override
  Future<String?> readRefreshToken() async => null;
  @override
  Future<StoredTokens?> readTokens() async => null;
  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {}
  @override
  Future<void> warmUp() async {}
}
