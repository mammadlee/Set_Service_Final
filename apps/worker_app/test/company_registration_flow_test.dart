import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/push/push_notification_service.dart';
import 'package:worker_app/core/push/push_registration_service.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/features/company/data/company_repository.dart';
import 'package:worker_app/features/company/presentation/company_auth_controller.dart';

const _enrollmentToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

void main() {
  test('company registration finalizes after phone OTP and password', () async {
    final requests = <RequestOptions>[];
    final fixture = _Fixture((options) async {
      requests.add(options);
      return switch (options.path) {
        '/auth/company/register' => _jsonResponse(201, {
          'enrollment_token': _enrollmentToken,
          'status': 'phone_otp_pending',
          'otp_sent': true,
        }),
        '/auth/verify-otp' => _jsonResponse(200, {
          'otp_verified': true,
          'password_required': true,
          'otp_challenge': 'phone-challenge-token-value',
        }),
        '/auth/company/complete-registration' => _jsonResponse(201, {
          'company_id': 'company-1',
          'status': 'pending_approval',
        }),
        _ => _jsonResponse(404, {'error': 'Not found'}),
      };
    });
    addTearDown(fixture.dispose);

    await fixture.controller.registerCompany(
      name: 'SET Test Hotel',
      contactName: 'Nigar Əliyeva',
      email: 'nigar@example.test',
      phone: '+994501112233',
    );
    expect(fixture.controller.state, CompanyAuthState.otpRequired);
    expect(fixture.controller.enrollmentToken, _enrollmentToken);

    await fixture.controller.submitOtpCode('123456');
    expect(fixture.controller.state, CompanyAuthState.passwordRequired);

    await fixture.controller.completeOtp(password: 'Secure123!');
    expect(fixture.controller.state, CompanyAuthState.pendingApproval);
    expect(fixture.controller.enrollmentToken, isNull);
    expect(fixture.controller.blockedStatus, 'pending_approval');

    expect(requests.map((request) => request.path), [
      '/auth/company/register',
      '/auth/verify-otp',
      '/auth/company/complete-registration',
    ]);
    expect(
      (requests[2].data as Map<String, dynamic>)['enrollment_token'],
      _enrollmentToken,
    );
    expect(fixture.storage.savedAccessToken, isNull);
  });

  test(
    'pending and rejected company logins never open protected app',
    () async {
      var status = 'pending_approval';
      final fixture = _Fixture((options) async {
        if (options.path == '/auth/company/login') {
          return _jsonResponse(403, {
            'error': status == 'pending_approval'
                ? 'Hesabınız admin təsdiqini gözləyir.'
                : 'Müəssisə hesabı giriş üçün təsdiqlənməyib.',
            'code': status == 'pending_approval'
                ? 'PENDING_APPROVAL'
                : 'COMPANY_NOT_APPROVED',
            'details': {'status': status},
          });
        }
        return _jsonResponse(404, {'error': 'Not found'});
      });
      addTearDown(fixture.dispose);

      await fixture.controller.loginCompany(
        email: 'pending@example.test',
        password: 'Secure123!',
      );
      expect(fixture.controller.state, CompanyAuthState.pendingApproval);
      expect(fixture.controller.errorMessage, isNull);
      expect(fixture.storage.savedAccessToken, isNull);

      fixture.controller.backToLogin();
      status = 'rejected';
      await fixture.controller.loginCompany(
        email: 'rejected@example.test',
        password: 'Secure123!',
      );
      expect(fixture.controller.state, CompanyAuthState.accountBlocked);
      expect(fixture.controller.blockedStatus, 'rejected');
      expect(fixture.storage.savedAccessToken, isNull);
    },
  );
}

class _Fixture {
  _Fixture(this.handler) {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
    dio.httpClientAdapter = _CallbackAdapter(handler);
    final apiClient = ApiClient(
      baseUrl: 'https://example.test/v1',
      tokenStorage: storage,
      expectedRole: 'company',
      sessionCoordinator: coordinator,
      dioOverride: dio,
      refreshDioOverride: Dio(BaseOptions(baseUrl: 'https://example.test/v1')),
    );
    controller = CompanyAuthController(
      CompanyRepository(apiClient: apiClient, tokenStorage: storage),
      PushRegistrationService(
        apiClient: apiClient,
        pushNotificationService: PushNotificationService(),
      ),
      coordinator,
    );
  }

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final storage = _MemoryTokenStorage();
  final coordinator = SessionCoordinator();
  late final CompanyAuthController controller;

  Future<void> dispose() async {
    controller.dispose();
    await coordinator.dispose();
  }
}

class _MemoryTokenStorage implements TokenStorage {
  String? savedAccessToken;
  String? savedRefreshToken;

  @override
  bool get isLoaded => true;

  @override
  String? get cachedAccessToken => savedAccessToken;

  @override
  String? get cachedRefreshToken => savedRefreshToken;

  @override
  Future<void> clear() async {
    savedAccessToken = null;
    savedRefreshToken = null;
  }

  @override
  Future<String?> readAccessToken() async => savedAccessToken;

  @override
  Future<String?> readRefreshToken() async => savedRefreshToken;

  @override
  Future<StoredTokens?> readTokens() async => null;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    savedAccessToken = accessToken;
    savedRefreshToken = refreshToken;
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
