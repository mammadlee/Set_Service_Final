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
import 'package:worker_app/features/auth/data/auth_repository.dart';
import 'package:worker_app/features/auth/data/models/auth_models.dart';
import 'package:worker_app/features/auth/presentation/controllers/auth_controller.dart';
import 'package:worker_app/features/taxonomy/data/taxonomy_repository.dart';
import 'package:worker_app/features/worker/data/worker_repository.dart';
import 'package:worker_app/features/worker/presentation/screens/worker_profile_screen.dart';

void main() {
  test(
    'phone-change request sends the current password for step-up auth',
    () async {
      RequestOptions? captured;
      final storage = _MemoryTokenStorage(_jwt(), 'refresh-token');
      final coordinator = SessionCoordinator();
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
      dio.httpClientAdapter = _CallbackAdapter((options) async {
        captured = options;
        return _jsonResponse(200, {
          'otp_sent': true,
          'purpose': 'worker_phone_change',
        });
      });
      final client = ApiClient(
        baseUrl: 'https://example.test/v1',
        tokenStorage: storage,
        expectedRole: 'worker',
        sessionCoordinator: coordinator,
        dioOverride: dio,
        refreshDioOverride: Dio(
          BaseOptions(baseUrl: 'https://example.test/v1'),
        ),
      );
      addTearDown(coordinator.dispose);

      await WorkerRepository(apiClient: client).requestPhoneChange(
        phone: '+994501112244',
        currentPassword: r'Current-password $ stays exact',
      );

      expect(captured?.method, 'POST');
      expect(captured?.path, '/auth/worker/phone-change/request');
      expect(captured?.data, {
        'phone': '+994501112244',
        'current_password': r'Current-password $ stays exact',
      });
      expect(storage.saveCount, 0);
      expect(storage.clearCount, 0);
    },
  );

  test(
    'confirmed phone change returns canonical phone and updates observable profile without replacing tokens',
    () async {
      RequestOptions? captured;
      final storage = _MemoryTokenStorage(_jwt(), 'refresh-token');
      final coordinator = SessionCoordinator();
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
      dio.httpClientAdapter = _CallbackAdapter((options) async {
        captured = options;
        return _jsonResponse(200, {
          'phone_changed': true,
          'phone': '+994501112244',
          'already_applied': false,
          'session_preserved': true,
          'user': {'id': 'user-1', 'phone': '+994501112244'},
        });
      });
      final client = ApiClient(
        baseUrl: 'https://example.test/v1',
        tokenStorage: storage,
        expectedRole: 'worker',
        sessionCoordinator: coordinator,
        dioOverride: dio,
        refreshDioOverride: Dio(
          BaseOptions(baseUrl: 'https://example.test/v1'),
        ),
      );
      final controller = AuthController(
        AuthRepository(apiClient: client, tokenStorage: storage),
        PushRegistrationService(
          apiClient: client,
          pushNotificationService: PushNotificationService(),
        ),
        coordinator,
      );
      addTearDown(() async {
        controller.dispose();
        await coordinator.dispose();
      });
      controller.updateWorkerProfile(WorkerMe.fromJson(_profileJson()));

      final result = await WorkerRepository(
        apiClient: client,
      ).confirmPhoneChange(phone: ' +994 (50) 111-22-44 ', otpCode: '123456');
      final updated = controller.updateWorkerPhone(result.phone);

      expect(captured?.method, 'POST');
      expect(captured?.path, '/auth/worker/phone-change/confirm');
      expect(captured?.data, {
        'phone': ' +994 (50) 111-22-44 ',
        'otp_code': '123456',
      });
      expect(result.phoneChanged, isTrue);
      expect(result.sessionPreserved, isTrue);
      expect(updated?.phone, '+994501112244');
      expect(updated?.name, 'Rəna Əliyeva');
      expect(controller.worker?.phone, '+994501112244');
      expect(storage.saveCount, 0);
      expect(storage.clearCount, 0);
      expect(storage.cachedRefreshToken, 'refresh-token');
    },
  );

  test('phone-change response requires the canonical server value', () {
    expect(
      () => WorkerPhoneChangeResult.fromJson({'phone_changed': true}),
      throwsFormatException,
    );
  });

  testWidgets(
    'phone-change UI obscures current password and sends it only to OTP request',
    (tester) async {
      tester.view.physicalSize = const Size(430, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      RequestOptions? phoneRequest;
      final storage = _MemoryTokenStorage(_jwt(), 'refresh-token');
      final coordinator = SessionCoordinator();
      final roleSession = RoleSessionController();
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
      dio.httpClientAdapter = _CallbackAdapter((options) async {
        switch (options.path) {
          case '/workers/me':
            return _jsonResponse(200, _profileJson());
          case '/taxonomy':
            return _jsonResponse(200, {'data': <Object>[]});
          case '/auth/worker/phone-change/request':
            phoneRequest = options;
            return _jsonResponse(200, {
              'otp_sent': true,
              'purpose': 'worker_phone_change',
            });
          default:
            throw StateError('Unexpected request: ${options.path}');
        }
      });
      final client = ApiClient(
        baseUrl: 'https://example.test/v1',
        tokenStorage: storage,
        expectedRole: 'worker',
        sessionCoordinator: coordinator,
        dioOverride: dio,
        refreshDioOverride: Dio(
          BaseOptions(baseUrl: 'https://example.test/v1'),
        ),
      );
      final controller = AuthController(
        AuthRepository(apiClient: client, tokenStorage: storage),
        PushRegistrationService(
          apiClient: client,
          pushNotificationService: PushNotificationService(),
        ),
        coordinator,
      );
      addTearDown(() async {
        controller.dispose();
        roleSession.dispose();
        await coordinator.dispose();
      });

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<RoleSessionController>.value(
              value: roleSession,
            ),
            ChangeNotifierProvider<AuthController>.value(value: controller),
            Provider<TaxonomyRepository>.value(
              value: TaxonomyRepository(apiClient: client),
            ),
            Provider<WorkerRepository>.value(
              value: WorkerRepository(apiClient: client),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const Scaffold(body: WorkerProfileScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final contactTile = find.text('Əlaqə');
      await tester.scrollUntilVisible(
        contactTile,
        260,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(contactTile);
      await tester.pumpAndSettle();

      final phoneField = find.widgetWithText(TextField, 'Telefon nömrəsi');
      await tester.enterText(phoneField, '+994501112244');
      await tester.pump();

      final passwordFinder = find.byKey(
        const ValueKey('worker-phone-change-current-password'),
      );
      final passwordField = tester.widget<TextField>(passwordFinder);
      expect(passwordField.obscureText, isTrue);
      expect(passwordField.enableSuggestions, isFalse);
      expect(passwordField.autocorrect, isFalse);

      await tester.enterText(passwordFinder, r'Current-password $ stays exact');
      final sendButton = find.text('OTP göndər');
      await tester.ensureVisible(sendButton);
      await tester.tap(sendButton);
      await tester.pumpAndSettle();

      expect(phoneRequest?.data, {
        'phone': '+994501112244',
        'current_password': r'Current-password $ stays exact',
      });
      expect(find.text('OTP kodu'), findsOneWidget);
      expect(storage.saveCount, 0);
      expect(storage.clearCount, 0);
    },
  );
}

Map<String, dynamic> _profileJson() => {
  'id': 'worker-1',
  'name': 'Rəna Əliyeva',
  'phone': '+994501112233',
  'position': 'Ofisiant',
  'position_ids': <String>[],
  'positions': <Object>[],
  'profile_photo_url': null,
  'skills': <Object>[],
  'languages': <Object>[],
  'documents': <Object>[],
  'work_history': <Object>[],
  'status': 'approved',
  'availability': true,
  'rating_avg': 0,
  'rating_count': 0,
};

typedef _AdapterHandler = Future<ResponseBody> Function(RequestOptions options);

class _CallbackAdapter implements HttpClientAdapter {
  _CallbackAdapter(this.handler);

  final _AdapterHandler handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

class _MemoryTokenStorage implements TokenStorage {
  _MemoryTokenStorage(this._accessToken, this._refreshToken);

  String? _accessToken;
  String? _refreshToken;
  int saveCount = 0;
  int clearCount = 0;

  @override
  bool get isLoaded => true;

  @override
  String? get cachedAccessToken => _accessToken;

  @override
  String? get cachedRefreshToken => _refreshToken;

  @override
  Future<void> warmUp() async {}

  @override
  Future<StoredTokens?> readTokens() async {
    final accessToken = _accessToken;
    final refreshToken = _refreshToken;
    if (accessToken == null || refreshToken == null) return null;
    return StoredTokens(accessToken: accessToken, refreshToken: refreshToken);
  }

  @override
  Future<String?> readAccessToken() async => _accessToken;

  @override
  Future<String?> readRefreshToken() async => _refreshToken;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    saveCount += 1;
    _accessToken = accessToken;
    _refreshToken = refreshToken;
  }

  @override
  Future<void> clear() async {
    clearCount += 1;
    _accessToken = null;
    _refreshToken = null;
  }
}

ResponseBody _jsonResponse(int statusCode, Map<String, dynamic> body) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );
}

String _jwt() {
  final header = base64Url
      .encode(utf8.encode(jsonEncode({'alg': 'none'})))
      .replaceAll('=', '');
  final payload = base64Url
      .encode(
        utf8.encode(
          jsonEncode({
            'role': 'worker',
            'jti': 'worker-phone-change-test',
            'exp':
                DateTime.now()
                    .add(const Duration(hours: 1))
                    .millisecondsSinceEpoch ~/
                1000,
          }),
        ),
      )
      .replaceAll('=', '');
  return '$header.$payload.signature';
}
