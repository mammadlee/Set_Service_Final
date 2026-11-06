import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/push/push_notification_service.dart';
import 'package:worker_app/core/push/push_registration_service.dart';
import 'package:worker_app/core/session/role_session_controller.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/features/admin/data/admin_repository.dart';
import 'package:worker_app/features/admin/presentation/admin_auth_controller.dart';
import 'package:worker_app/features/admin/presentation/admin_home_shell.dart';
import 'package:worker_app/shared/app_strings.dart';

const _longOrderTitle =
    'Four Seasons beynəlxalq banket xidməti üçün çox uzun sifariş adı';
const _longWorkerName =
    'Məhəmməd Əli Hüseynzadə Məmmədov uzun adlı təsdiqlənmiş işçi';

void main() {
  for (final size in <Size>[const Size(320, 640), const Size(1024, 768)]) {
    testWidgets(
      'real Admin shell and drawer fit ${size.width.toInt()}x${size.height.toInt()}',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final fixture = _AdminShellFixture();
        addTearDown(fixture.dispose);

        await tester.pumpWidget(fixture.app());
        await tester.pumpAndSettle();

        expect(find.text('Admin paneli'), findsOneWidget);
        expect(find.text('Bugünkü aktiv sifarişlər'), findsOneWidget);
        expect(find.text('Təsdiqlər'), findsOneWidget);
        expect(tester.takeException(), isNull);

        tester.state<ScaffoldState>(find.byType(Scaffold).first).openDrawer();
        await tester.pumpAndSettle();

        expect(find.byType(Drawer), findsOneWidget);
        expect(
          tester.getSize(find.byType(Drawer)).width,
          lessThanOrEqualTo(380),
        );
        expect(
          find.text('Uzun adlı sistem administratoru Əli Məmmədli'),
          findsOneWidget,
        );
        await tester.scrollUntilVisible(
          find.text('Moderasiya'),
          180,
          scrollable: find.descendant(
            of: find.byType(Drawer),
            matching: find.byType(Scrollable),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Moderasiya'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'Admin assignment selectors render empty and selected text exactly once',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final fixture = _AdminShellFixture();
      addTearDown(fixture.dispose);

      await tester.pumpWidget(fixture.app());
      await tester.pumpAndSettle();

      tester.state<ScaffoldState>(find.byType(Scaffold).first).openDrawer();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Təyinatlar'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(FloatingActionButton, AppStrings.assignWorker),
      );
      await tester.pumpAndSettle();

      expect(find.text(AppStrings.selectOrder), findsOneWidget);
      expect(find.text(AppStrings.selectWorker), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.text(AppStrings.selectOrder));
      await tester.pumpAndSettle();
      await tester.tap(find.text(_longOrderTitle));
      await tester.pumpAndSettle();

      expect(find.text(AppStrings.selectOrder), findsNothing);
      expect(find.text(_longOrderTitle), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.text(AppStrings.selectWorker));
      await tester.pumpAndSettle();
      await tester.tap(find.text(_longWorkerName));
      await tester.pumpAndSettle();

      expect(find.text(AppStrings.selectWorker), findsNothing);
      expect(find.text(_longWorkerName), findsOneWidget);
      expect(find.text(_longOrderTitle), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

class _AdminShellFixture {
  _AdminShellFixture() {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
    dio.httpClientAdapter = _CallbackAdapter((options) async {
      if (options.path == '/admin/reports/summary') {
        return _jsonResponse(200, <String, dynamic>{
          'dashboard': <String, dynamic>{
            'today_active_orders': 12,
            'pending_orders': 3,
            'active_assignments': 8,
            'checked_in_workers_today': 6,
            'rejected_assignments': 1,
            'pending_worker_approvals': 4,
            'pending_company_approvals': 2,
          },
          'reports': <String, dynamic>{
            'attendance': <String, dynamic>{
              'total_count': 6,
              'completed_count': 2,
              'open_count': 4,
            },
            'rating_stats': <String, dynamic>{'average': 4.8, 'count': 10},
          },
        });
      }
      if (options.path == '/assignments') {
        return _jsonResponse(200, <String, dynamic>{
          'data': <Object>[],
          'meta': _pageMeta(),
        });
      }
      if (options.path == '/orders') {
        return _jsonResponse(200, <String, dynamic>{
          'data': <Object>[
            <String, dynamic>{
              'id': 'order-review-1',
              'title': _longOrderTitle,
              'description': 'Banket xidməti',
              'category': 'Baş ofisiant köməkçisi',
              'status': 'published',
              'required_count': 2,
              'assignment_count': 0,
              'location': 'Bakı şəhəri, uzun ünvan',
              'category_items': <Object>[
                <String, dynamic>{
                  'id': 'category-review-1',
                  'category': 'Baş ofisiant köməkçisi',
                  'required_count': 2,
                  'assigned_count': 0,
                  'remaining_count': 2,
                },
              ],
            },
          ],
          'meta': _pageMeta(total: 1),
        });
      }
      if (options.path == '/admin/workers') {
        return _jsonResponse(200, <String, dynamic>{
          'data': <Object>[
            <String, dynamic>{
              'id': 'worker-review-1',
              'name': _longWorkerName,
              'phone': '+994700000003',
              'status': 'approved',
              'position': 'Baş ofisiant köməkçisi',
              'availability': true,
              'worker_class': 'A',
              'rating_avg': 4.9,
              'rating_count': 18,
            },
          ],
          'meta': _pageMeta(total: 1),
        });
      }
      return _jsonResponse(200, <String, dynamic>{});
    });
    coordinator = SessionCoordinator();
    roleSession = RoleSessionController();
    client = ApiClient(
      baseUrl: 'https://example.test/v1',
      tokenStorage: tokens,
      expectedRole: 'super_admin',
      sessionCoordinator: coordinator,
      dioOverride: dio,
      refreshDioOverride: Dio(BaseOptions(baseUrl: 'https://example.test/v1')),
    );
    repository = AdminRepository(apiClient: client, tokenStorage: tokens);
    auth =
        AdminAuthController(
            repository,
            _NoopPushRegistrationService(client),
            coordinator,
          )
          ..state = AdminAuthState.authenticated
          ..adminRole = 'super_admin'
          ..adminName = 'Uzun adlı sistem administratoru Əli Məmmədli';
  }

  final _MemoryTokens tokens = _MemoryTokens();
  late final SessionCoordinator coordinator;
  late final RoleSessionController roleSession;
  late final ApiClient client;
  late final AdminRepository repository;
  late final AdminAuthController auth;

  Widget app() => MultiProvider(
    providers: [
      Provider<AdminRepository>.value(value: repository),
      ChangeNotifierProvider<AdminAuthController>.value(value: auth),
      ChangeNotifierProvider<RoleSessionController>.value(value: roleSession),
    ],
    child: MaterialApp(theme: AppTheme.light(), home: const AdminHomeShell()),
  );

  void dispose() {
    auth.dispose();
    roleSession.dispose();
    coordinator.dispose();
  }
}

Map<String, dynamic> _pageMeta({int total = 0}) => <String, dynamic>{
  'page': 1,
  'limit': 50,
  'total': total,
  'total_pages': total == 0 ? 0 : 1,
};

class _NoopPushRegistrationService extends PushRegistrationService {
  _NoopPushRegistrationService(ApiClient apiClient)
    : super(
        apiClient: apiClient,
        pushNotificationService: PushNotificationService(),
      );

  @override
  Future<void> registerDeviceToken() async {}

  @override
  Future<void> unregisterDeviceToken() async {}

  @override
  Future<void> dispose() async {}
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
