import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/push/push_notification_service.dart';
import 'package:worker_app/core/push/push_registration_service.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/features/auth/data/auth_repository.dart';
import 'package:worker_app/features/auth/data/models/auth_models.dart';
import 'package:worker_app/features/auth/presentation/controllers/auth_controller.dart';
import 'package:worker_app/features/auth/presentation/screens/enrollment_documents_section.dart';
import 'package:worker_app/features/worker/data/worker_repository.dart';

void main() {
  for (final width in [360.0, 430.0]) {
    testWidgets('pending documents load from API after reopening at $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 820);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final storage = _MemoryTokenStorage();
      final coordinator = SessionCoordinator();
      addTearDown(coordinator.dispose);
      var reads = 0;
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
      dio.httpClientAdapter = _CallbackAdapter((options) async {
        expect(options.path, '/workers/me/enrollment');
        expect(options.headers['authorization'], 'Bearer enrollment-only');
        reads++;
        return _jsonResponse(200, {
          ..._profileJson(''),
          'status': 'pending_approval',
          'documents': [
            for (final type in ['health_certificate', 'criminal_record'])
              {
                'type': type,
                'name': 'Uzun-adlı-arayış-sənədi.pdf',
                'available': true,
                'status': 'ready',
                'scan_status': 'clean',
                'download_url': '/v1/workers/worker-1/documents/$type/download',
              },
          ],
        });
      });
      final client = ApiClient(
        baseUrl: 'https://example.test/v1',
        tokenStorage: storage,
        expectedRole: 'worker',
        sessionCoordinator: coordinator,
        dioOverride: dio,
      );
      for (var opening = 0; opening < 2; opening++) {
        await tester.pumpWidget(
          Provider<WorkerRepository>(
            create: (_) => WorkerRepository(apiClient: client),
            child: MaterialApp(
              theme: AppTheme.light(),
              home: Scaffold(
                body: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: EnrollmentDocumentsSection(
                    key: ValueKey(opening),
                    token: 'enrollment-only',
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('worker-document-health_certificate')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('worker-document-criminal_record')),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      }
      expect(reads, 2);
      expect(storage.saveCount, 0);
    });
  }

  for (final status in ['pending_approval', 'rejected']) {
    test(
      '$status login never opens worker app or stores enrollment as access',
      () async {
        final storage = _MemoryTokenStorage();
        final coordinator = SessionCoordinator();
        final calls = <String>[];
        final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
        dio.httpClientAdapter = _CallbackAdapter((options) async {
          calls.add(options.path);
          if (options.path == '/auth/worker/login') {
            return _jsonResponse(403, {
              'code': 'WORKER_NOT_APPROVED',
              'details': {'status': status},
            });
          }
          expect(options.path, '/auth/worker/document-session');
          return _jsonResponse(200, {
            'worker_id': 'worker-1',
            'status': status,
            'registration_access_token': 'short-lived-document-token',
          });
        });
        final client = ApiClient(
          baseUrl: 'https://example.test/v1',
          tokenStorage: storage,
          expectedRole: 'worker',
          sessionCoordinator: coordinator,
          dioOverride: dio,
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
        await controller.loginWorker(
          phone: '+994501112233',
          password: 'Worker123!',
        );
        expect(
          controller.state,
          status == 'pending_approval'
              ? AuthViewState.pendingApproval
              : AuthViewState.accountBlocked,
        );
        expect(controller.worker, isNull);
        expect(storage.saveCount, 0);
        expect(
          calls,
          status == 'pending_approval'
              ? ['/auth/worker/login', '/auth/worker/document-session']
              : ['/auth/worker/login'],
        );
        expect(
          controller.documentSessionToken,
          status == 'pending_approval' ? 'short-lived-document-token' : null,
        );
        controller.backToLogin();
        expect(controller.documentSessionToken, isNull);
      },
    );
  }

  test(
    'worker profile mutations and refreshes share one observable model',
    () async {
      var serverProfile = _profileJson('/uploads/profile-v2.webp');
      final storage = _MemoryTokenStorage();
      final coordinator = SessionCoordinator();
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
      dio.httpClientAdapter = _CallbackAdapter((options) async {
        expect(options.path, '/workers/me');
        return _jsonResponse(200, serverProfile);
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

      var notifications = 0;
      controller.addListener(() => notifications += 1);
      controller.errorMessage = 'Köhnə xəta';
      controller.updateWorkerProfile(
        WorkerMe.fromJson(_profileJson('/uploads/profile-v1.webp')),
        profilePhotoChanged: true,
      );

      expect(controller.worker?.profilePhotoUrl, '/uploads/profile-v1.webp');
      expect(controller.workerPhotoRevision, 1);
      expect(controller.errorMessage, isNull);

      serverProfile = _profileJson('/uploads/profile-v3.webp');
      final refreshed = await controller.refreshWorkerProfile();

      expect(refreshed.profilePhotoUrl, '/uploads/profile-v3.webp');
      expect(controller.worker, same(refreshed));
      expect(controller.workerPhotoRevision, 1);
      expect(controller.errorMessage, isNull);
      expect(notifications, 2);
    },
  );
}

Map<String, dynamic> _profileJson(String photoUrl) {
  return {
    'id': 'worker-1',
    'name': 'Rəna Əliyeva',
    'phone': '+994501112233',
    'position': 'Ofisiant',
    'position_ids': ['position-1'],
    'positions': <Object>[],
    'profile_photo_url': photoUrl,
    'skills': <Object>[],
    'languages': <Object>[],
    'documents': <Object>[],
    'work_history': <Object>[],
    'status': 'approved',
    'availability': true,
    'rating_avg': 0,
    'rating_count': 0,
  };
}

class _MemoryTokenStorage implements TokenStorage {
  int saveCount = 0;
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
  }) async {
    saveCount++;
  }

  @override
  Future<void> warmUp() async {}
}

class _CallbackAdapter implements HttpClientAdapter {
  _CallbackAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;

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

ResponseBody _jsonResponse(int statusCode, Map<String, dynamic> body) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );
}
