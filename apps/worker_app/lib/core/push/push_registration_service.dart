import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../network/api_client.dart';
import '../storage/secure_storage_config.dart';
import 'push_notification_service.dart';

class PushRegistrationService {
  PushRegistrationService({
    required ApiClient apiClient,
    required PushNotificationService pushNotificationService,
    FlutterSecureStorage? storage,
  }) : _dio = apiClient.dio,
       _pushNotificationService = pushNotificationService,
       _storage = storage ?? SecureStorageConfig.storage;

  static const _installationIdKey = 'setservice_device_installation_id';

  final Dio _dio;
  final PushNotificationService _pushNotificationService;
  final FlutterSecureStorage _storage;
  StreamSubscription<String>? _tokenRefreshSubscription;
  String? _registeredToken;
  Future<void>? _registrationInFlight;

  Future<void> registerDeviceToken() {
    final inFlight = _registrationInFlight;
    if (inFlight != null) return inFlight;

    late final Future<void> registration;
    registration = _registerCurrentToken().whenComplete(() {
      if (identical(_registrationInFlight, registration)) {
        _registrationInFlight = null;
      }
    });
    _registrationInFlight = registration;
    return registration;
  }

  Future<void> _registerCurrentToken() async {
    final token = await _pushNotificationService.getToken();
    if (token == null || token.isEmpty) return;
    await _registerTokenWithRetry(token);

    _tokenRefreshSubscription ??= _pushNotificationService.onTokenRefresh
        .listen((newToken) {
          if (newToken.isNotEmpty) {
            unawaited(_registerTokenWithRetry(newToken));
          }
        });
  }

  Future<void> unregisterDeviceToken() async {
    final token =
        _registeredToken ?? await _pushNotificationService.currentToken();
    try {
      await _tokenRefreshSubscription?.cancel();

      if (token != null && token.isNotEmpty) {
        await _dio.delete<void>(
          '/auth/fcm-token',
          data: {'fcm_token': token},
          options: Options(extra: {'skipAuthRefresh': true}),
        );
      }
    } catch (_) {
      // Logout must continue even if server-side push cleanup fails.
    } finally {
      _tokenRefreshSubscription = null;
      _registeredToken = null;
      await _pushNotificationService.deleteLocalToken();
    }
  }

  Future<void> dispose() async {
    await _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = null;
  }

  Future<void> _registerTokenWithRetry(String token) async {
    if (_registeredToken == token) return;
    final deviceId = await _installationId();

    for (var attempt = 0; attempt < 4; attempt += 1) {
      try {
        await _dio.post<Map<String, dynamic>>(
          '/auth/fcm-token',
          data: {
            'fcm_token': token,
            'platform': _platformName(),
            'device_id': deviceId,
          },
        );
        _registeredToken = token;
        return;
      } on DioException catch (error) {
        if (!_isRetryable(error) || attempt == 3) return;
        await Future<void>.delayed(
          Duration(milliseconds: 500 * (1 << attempt)),
        );
      } catch (_) {
        // Push registration is non-critical and should not block login.
        return;
      }
    }
  }

  bool _isRetryable(DioException error) {
    final status = error.response?.statusCode;
    if (status == 429 || (status != null && status >= 500)) return true;
    return switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.connectionError => true,
      _ => false,
    };
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
