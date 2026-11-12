import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/features/admin/data/admin_repository.dart';
import 'package:worker_app/features/admin/presentation/admin_home_shell.dart';
import 'package:worker_app/shared/app_strings.dart';
import 'package:worker_app/shared/models/mobile_models.dart';

void main() {
  testWidgets(
    'pending worker can be approved without a class on narrow screens',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      RequestOptions? approvalRequest;
      final fixture = _ApprovalFixture((options) async {
        approvalRequest = options;
        return _jsonResponse(200, _workerJson(status: 'approved'));
      });
      addTearDown(fixture.dispose);
      var resolvedId = '';

      await tester.pumpWidget(
        fixture.wrap(
          AdminWorkerApprovalCard(
            worker: _worker(),
            onResolved: (id) async => resolvedId = id,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final approveButton = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, AppStrings.approve),
      );
      expect(approveButton.onPressed, isNotNull);
      expect(find.text('Sonra təyin et'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.widgetWithText(ElevatedButton, AppStrings.approve));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text(AppStrings.confirm),
        ),
      );
      await tester.pumpAndSettle();

      expect(resolvedId, 'worker-1');
      expect(approvalRequest?.path, '/admin/workers/worker-1/approve');
      expect(approvalRequest?.data, <String, dynamic>{'worker_class': null});
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('selected class is submitted atomically with approval', (
    tester,
  ) async {
    RequestOptions? approvalRequest;
    final fixture = _ApprovalFixture((options) async {
      approvalRequest = options;
      return _jsonResponse(
        200,
        _workerJson(status: 'approved', workerClass: 'B'),
      );
    });
    addTearDown(fixture.dispose);

    await tester.pumpWidget(
      fixture.wrap(
        AdminWorkerApprovalCard(worker: _worker(), onResolved: (_) async {}),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('B').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ElevatedButton, AppStrings.approve));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text(AppStrings.confirm),
      ),
    );
    await tester.pumpAndSettle();

    expect(approvalRequest?.data, <String, dynamic>{'worker_class': 'B'});
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed approval keeps the card and shows the API error', (
    tester,
  ) async {
    final fixture = _ApprovalFixture((_) async {
      return _jsonResponse(409, <String, dynamic>{
        'error': 'Worker registration prerequisites are incomplete.',
        'code': 'APPROVAL_PREREQUISITES_MISSING',
        'details': <String, dynamic>{
          'status': 'pending_approval',
          'missing': <String>['password_set', 'position'],
        },
      });
    });
    addTearDown(fixture.dispose);
    var resolved = false;

    await tester.pumpWidget(
      fixture.wrap(
        AdminWorkerApprovalCard(
          worker: _worker(),
          onResolved: (_) async => resolved = true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, AppStrings.approve));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text(AppStrings.confirm),
      ),
    );
    await tester.pumpAndSettle();

    expect(resolved, isFalse);
    expect(find.byType(AdminWorkerApprovalCard), findsOneWidget);
    expect(
      find.text(
        'Təsdiqdən əvvəl bunlar tamamlanmalıdır: '
        'şifrə yaradılmalıdır; ən azı bir vəzifə seçilməlidir.',
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('approval card remains scrollable with large Azerbaijani text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final fixture = _ApprovalFixture((_) async {
      return _jsonResponse(500, <String, dynamic>{});
    });
    addTearDown(fixture.dispose);

    await tester.pumpWidget(
      fixture.wrap(
        AdminWorkerApprovalCard(worker: _worker(), onResolved: (_) async {}),
        textScale: 1.6,
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.widgetWithText(ElevatedButton, AppStrings.approve),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(find.text('Sonra təyin et'), findsOneWidget);
    expect(
      tester
          .getSize(find.widgetWithText(ElevatedButton, AppStrings.approve))
          .height,
      greaterThanOrEqualTo(44),
    );
    expect(tester.takeException(), isNull);
  });
}

AdminWorkerProfile _worker() => const AdminWorkerProfile(
  id: 'worker-1',
  name: 'Uzun adlı təsdiq gözləyən işçi',
  phone: '+994501234567',
  status: 'pending_approval',
  position: 'Baş tədbir və qonaq xidməti əməkdaşı',
  availability: true,
  workerClass: null,
  ratingAverage: 0,
  ratingCount: 0,
  isFocTraining: false,
);

Map<String, dynamic> _workerJson({
  required String status,
  String? workerClass,
}) => <String, dynamic>{
  'id': 'worker-1',
  'name': 'Uzun adlı təsdiq gözləyən işçi',
  'phone': '+994501234567',
  'status': status,
  'position': 'Baş tədbir və qonaq xidməti əməkdaşı',
  'availability': true,
  'worker_class': workerClass,
  'rating_avg': 0,
  'rating_count': 0,
  'is_foc_training': false,
};

class _ApprovalFixture {
  _ApprovalFixture(_AdapterHandler handler) {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
    dio.httpClientAdapter = _CallbackAdapter(handler);
    coordinator = SessionCoordinator();
    final apiClient = ApiClient(
      baseUrl: 'https://example.test/v1',
      tokenStorage: tokens,
      expectedRole: 'super_admin',
      sessionCoordinator: coordinator,
      dioOverride: dio,
      refreshDioOverride: Dio(BaseOptions(baseUrl: 'https://example.test/v1')),
    );
    repository = AdminRepository(apiClient: apiClient, tokenStorage: tokens);
  }

  final _MemoryTokens tokens = _MemoryTokens();
  late final SessionCoordinator coordinator;
  late final AdminRepository repository;

  Widget wrap(Widget child, {double textScale = 1}) =>
      Provider<AdminRepository>.value(
        value: repository,
        child: MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: child!,
          ),
          theme: AppTheme.light(),
          home: Scaffold(
            body: SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: child,
              ),
            ),
          ),
        ),
      );

  void dispose() => coordinator.dispose();
}

typedef _AdapterHandler = Future<ResponseBody> Function(RequestOptions options);

class _CallbackAdapter implements HttpClientAdapter {
  _CallbackAdapter(this.handler);

  final _AdapterHandler handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => handler(options);

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonResponse(int statusCode, Map<String, dynamic> body) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: <String, List<String>>{
      Headers.contentTypeHeader: <String>['application/json'],
    },
  );
}

class _MemoryTokens implements TokenStorage {
  @override
  bool get isLoaded => true;

  @override
  String? get cachedAccessToken => null;

  @override
  String? get cachedRefreshToken => null;

  @override
  Future<void> warmUp() async {}

  @override
  Future<StoredTokens?> readTokens() async => null;

  @override
  Future<String?> readAccessToken() async => null;

  @override
  Future<String?> readRefreshToken() async => null;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {}

  @override
  Future<void> clear() async {}
}
