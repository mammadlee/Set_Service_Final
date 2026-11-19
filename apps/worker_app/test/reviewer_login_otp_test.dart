import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/push/push_notification_service.dart';
import 'package:worker_app/core/push/push_registration_service.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/features/admin/data/admin_repository.dart';
import 'package:worker_app/features/admin/presentation/admin_auth_controller.dart';
import 'package:worker_app/features/auth/data/auth_repository.dart';
import 'package:worker_app/features/auth/presentation/controllers/auth_controller.dart';
import 'package:worker_app/features/company/data/company_repository.dart';
import 'package:worker_app/features/company/presentation/company_auth_controller.dart';

void main() {
  test('worker reviewer OTP is sent only after the server challenge', () async {
    final requests = <RequestOptions>[];
    final fixture = _Fixture('worker', requests);
    final controller = AuthController(
      AuthRepository(apiClient: fixture.client, tokenStorage: fixture.storage),
      fixture.pushRegistration,
      fixture.coordinator,
    );
    addTearDown(() async {
      controller.dispose();
      await fixture.dispose();
    });

    await controller.loginWorker(
      phone: '+994501112233',
      password: 'SyntheticPassword1!',
    );
    expect(controller.reviewerOtpRequired, isTrue);
    expect(_body(requests.last), isNot(contains('otp_code')));

    controller.clearReviewerOtpChallenge();
    expect(controller.reviewerOtpRequired, isFalse);
    await controller.loginWorker(
      phone: '+994501112234',
      password: 'SyntheticPassword1!',
    );
    expect(_body(requests.last), isNot(contains('otp_code')));

    await controller.loginWorker(
      phone: '+994501112234',
      password: 'SyntheticPassword1!',
      reviewerOtpCode: '654321',
    );
    expect(_body(requests.last)['otp_code'], '654321');
  });

  test(
    'company reviewer OTP is sent only after the server challenge',
    () async {
      final requests = <RequestOptions>[];
      final fixture = _Fixture('company', requests);
      final controller = CompanyAuthController(
        CompanyRepository(
          apiClient: fixture.client,
          tokenStorage: fixture.storage,
        ),
        fixture.pushRegistration,
        fixture.coordinator,
      );
      addTearDown(() async {
        controller.dispose();
        await fixture.dispose();
      });

      await controller.loginCompany(
        email: 'review.company@example.test',
        password: 'SyntheticPassword1!',
      );
      expect(controller.reviewerOtpRequired, isTrue);
      expect(_body(requests.last), isNot(contains('otp_code')));

      controller.clearReviewerOtpChallenge();
      expect(controller.reviewerOtpRequired, isFalse);
      await controller.loginCompany(
        email: 'other.company@example.test',
        password: 'SyntheticPassword1!',
      );
      expect(_body(requests.last), isNot(contains('otp_code')));

      await controller.loginCompany(
        email: 'other.company@example.test',
        password: 'SyntheticPassword1!',
        reviewerOtpCode: '654321',
      );
      expect(_body(requests.last)['otp_code'], '654321');
    },
  );

  test('admin reviewer OTP is sent only after the server challenge', () async {
    final requests = <RequestOptions>[];
    final fixture = _Fixture('super_admin', requests);
    final controller = AdminAuthController(
      AdminRepository(apiClient: fixture.client, tokenStorage: fixture.storage),
      fixture.pushRegistration,
      fixture.coordinator,
    );
    addTearDown(() async {
      controller.dispose();
      await fixture.dispose();
    });

    await controller.loginAdmin(
      email: 'review.admin@example.test',
      password: 'SyntheticPassword1!',
    );
    expect(controller.reviewerOtpRequired, isTrue);
    expect(_body(requests.last), isNot(contains('otp_code')));

    controller.clearReviewerOtpChallenge();
    expect(controller.reviewerOtpRequired, isFalse);
    await controller.loginAdmin(
      email: 'other.admin@example.test',
      password: 'SyntheticPassword1!',
    );
    expect(_body(requests.last), isNot(contains('otp_code')));

    await controller.loginAdmin(
      email: 'other.admin@example.test',
      password: 'SyntheticPassword1!',
      reviewerOtpCode: '654321',
    );
    expect(_body(requests.last)['otp_code'], '654321');
  });
}

Map<String, dynamic> _body(RequestOptions request) {
  return Map<String, dynamic>.from(request.data as Map);
}

class _Fixture {
  _Fixture(String role, List<RequestOptions> requests) {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
    dio.httpClientAdapter = _CallbackAdapter((options) async {
      requests.add(options);
      return _jsonResponse(401, const {
        'error': 'Əlavə reviewer təsdiqi tələb olunur.',
        'code': 'REVIEWER_OTP_REQUIRED',
      });
    });
    client = ApiClient(
      baseUrl: 'https://example.test/v1',
      tokenStorage: storage,
      expectedRole: role,
      sessionCoordinator: coordinator,
      dioOverride: dio,
      refreshDioOverride: Dio(BaseOptions(baseUrl: 'https://example.test/v1')),
    );
    pushRegistration = PushRegistrationService(
      apiClient: client,
      pushNotificationService: PushNotificationService(),
    );
  }

  final storage = _MemoryTokenStorage();
  final coordinator = SessionCoordinator();
  late final ApiClient client;
  late final PushRegistrationService pushRegistration;

  Future<void> dispose() async {
    await coordinator.dispose();
  }
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
