import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/push/push_notification_service.dart';
import 'package:worker_app/core/push/push_registration_service.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/features/auth/data/auth_repository.dart';
import 'package:worker_app/features/auth/data/models/auth_models.dart';
import 'package:worker_app/features/auth/presentation/controllers/auth_controller.dart';

void main() {
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
      );

      expect(controller.worker?.profilePhotoUrl, '/uploads/profile-v1.webp');
      expect(controller.errorMessage, isNull);

      serverProfile = _profileJson('/uploads/profile-v3.webp');
      final refreshed = await controller.refreshWorkerProfile();

      expect(refreshed.profilePhotoUrl, '/uploads/profile-v3.webp');
      expect(controller.worker, same(refreshed));
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
