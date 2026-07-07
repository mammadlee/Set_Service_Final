import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../network/api_client.dart';
import 'push_notification_service.dart';

class PushRegistrationService {
  PushRegistrationService({
    required ApiClient apiClient,
    required PushNotificationService pushNotificationService,
    FlutterSecureStorage? storage,
  }) : _dio = apiClient.dio,
       _pushNotificationService = pushNotificationService,
       _storage = storage ?? const FlutterSecureStorage();

  static const _installationIdKey = 'setservice_device_installation_id';

  final Dio _dio;
  final PushNotificationService _pushNotificationService;
  final FlutterSecureStorage _storage;
  StreamSubscription<String>? _tokenRefreshSubscription;
  String? _registeredToken;

  Future<void> registerDeviceToken() async {
    final token = await _pushNotificationService.getToken();
    if (token == null || token.isEmpty) return;
    await _registerToken(token);

    _tokenRefreshSubscription ??= _pushNotificationService.onTokenRefresh
        .listen((newToken) {
          if (newToken.isNotEmpty) {
            unawaited(_registerToken(newToken));
          }
        });
  }

  Future<void> unregisterDeviceToken() async {
    final token =
        _registeredToken ?? await _pushNotificationService.currentToken();
    await _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = null;
    _registeredToken = null;

    if (token != null && token.isNotEmpty) {
      try {
        await _dio.delete<void>(
          '/auth/fcm-token',
          data: {'fcm_token': token},
          options: Options(extra: {'skipAuthRefresh': true}),
        );
      } catch (_) {
        // Logout must continue even if push token cleanup fails.
      }
    }
  }

  Future<void> _registerToken(String token) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/fcm-token',
        data: {
          'fcm_token': token,
          'platform': _platformName(),
          'device_id': await _installationId(),
        },
      );
      _registeredToken = token;
    } catch (_) {
      // Push registration is non-critical and should not block login.
    }
  }

  Future<String> _installationId() async {
    final existing = await _storage.read(key: _installationIdKey);
    if (existing != null && existing.isNotEmpty) return existing;

    final random = Random.secure();
    final bytes = List<int>.generate(24, (_) => random.nextInt(256));
    final id = base64UrlEncode(bytes).replaceAll('=', '');
    await _storage.write(key: _installationIdKey, value: id);
    return id;
  }

  String _platformName() {
    if (kIsWeb) return 'web';
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      _ => 'unknown',
    };
  }
}
