import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/push/push_notification_service.dart';
import 'package:worker_app/core/push/push_registration_service.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';

void main() {
  test(
    'logout deletes the local FCM token when server cleanup fails',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      final adapter = _FailingAdapter();
      dio.httpClientAdapter = adapter;
      final pushNotifications = _FakePushNotificationService('device-token');
      final service = PushRegistrationService(
        apiClient: ApiClient(
          baseUrl: 'https://example.test',
          tokenStorage: _EmptyTokenStorage(),
          expectedRole: 'worker',
          sessionCoordinator: SessionCoordinator(),
          dioOverride: dio,
        ),
        pushNotificationService: pushNotifications,
      );

      await service.unregisterDeviceToken();

      expect(adapter.requestedPaths, ['/auth/fcm-token']);
      expect(pushNotifications.deleteLocalTokenCalls, 1);
    },
  );
}

class _FakePushNotificationService extends PushNotificationService {
  _FakePushNotificationService(this.token);

  final String? token;
  int deleteLocalTokenCalls = 0;

  @override
  Future<String?> currentToken() async => token;

  @override
  Future<void> deleteLocalToken() async {
    deleteLocalTokenCalls += 1;
  }
}

class _FailingAdapter implements HttpClientAdapter {
  final List<String> requestedPaths = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requestedPaths.add(options.path);
    return ResponseBody.fromString(
      '{"message":"offline"}',
      503,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _EmptyTokenStorage implements TokenStorage {
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
