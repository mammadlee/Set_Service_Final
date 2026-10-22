import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/features/assignments/data/assignment_repository.dart';
import 'package:worker_app/features/company/data/company_repository.dart';
import 'package:worker_app/features/worker/data/models/worker_rating.dart';
import 'package:worker_app/features/worker/data/worker_repository.dart';

void main() {
  test(
    'Worker reports assigned order, company and own visible rating',
    () async {
      final requests = <RequestOptions>[];
      final fixture = _Fixture('worker', requests);
      addTearDown(fixture.dispose);
      final assignments = AssignmentRepository(apiClient: fixture.client);
      await assignments.reportOrder(
        orderId: 'order-id',
        reason: 'privacy',
        details: '  Məlumat  ',
      );
      await assignments.reportCompany(
        companyId: 'company-id',
        reason: 'harassment',
      );
      await WorkerRepository(
        apiClient: fixture.client,
      ).reportRating(ratingId: 'rating-id', reason: 'false_information');

      expect(
        requests.map((request) => request.path),
        everyElement('/moderation/reports'),
      );
      expect(requests.map((request) => request.method), everyElement('POST'));
      expect(requests[0].data, {
        'target_type': 'order',
        'target_id': 'order-id',
        'reason': 'privacy',
        'details': 'Məlumat',
      });
      expect(requests[1].data, {
        'target_type': 'company_profile',
        'target_id': 'company-id',
        'reason': 'harassment',
      });
      expect(requests[2].data, {
        'target_type': 'rating',
        'target_id': 'rating-id',
        'reason': 'false_information',
      });
    },
  );

  test('Company reports only the visible Worker profile target', () async {
    final requests = <RequestOptions>[];
    final fixture = _Fixture('company', requests);
    addTearDown(fixture.dispose);
    await CompanyRepository(
      apiClient: fixture.client,
      tokenStorage: fixture.tokens,
    ).reportWorkerProfile(
      workerId: 'worker-id',
      reason: 'inappropriate_content',
    );
    expect(requests.single.path, '/moderation/reports');
    expect(requests.single.data, {
      'target_type': 'worker_profile',
      'target_id': 'worker-id',
      'reason': 'inappropriate_content',
    });
  });

  test('Company account deletion sends explicit confirmation', () async {
    final requests = <RequestOptions>[];
    final fixture = _Fixture('company', requests);
    addTearDown(fixture.dispose);
    await CompanyRepository(
      apiClient: fixture.client,
      tokenStorage: fixture.tokens,
    ).deleteMyAccount();
    expect(requests.single.path, '/companies/me/account-deletion-request');
    expect(requests.single.method, 'POST');
    expect(requests.single.data, {'confirm': true});
  });

  test('Worker rating summary preserves the visible comment and order', () {
    final summary = WorkerRatingSummary.fromJson({
      'rating_avg': 4.5,
      'rating_count': 1,
      'data': [
        {
          'id': 'rating-id',
          'score': 5,
          'feedback': 'Yaxşı xidmət',
          'created_at': '2026-09-21T10:00:00Z',
          'order': {'title': 'Banket xidməti'},
        },
      ],
    });
    expect(summary.average, 4.5);
    expect(summary.total, 1);
    expect(summary.ratings.single.feedback, 'Yaxşı xidmət');
    expect(summary.ratings.single.orderTitle, 'Banket xidməti');
  });
}

class _Fixture {
  _Fixture(String role, List<RequestOptions> requests)
    : tokens = _MemoryTokens(_jwt(role)) {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
    dio.httpClientAdapter = _CallbackAdapter((options) async {
      requests.add(options);
      return ResponseBody.fromString(
        '{}',
        201,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );
    });
    coordinator = SessionCoordinator();
    client = ApiClient(
      baseUrl: 'https://example.test/v1',
      tokenStorage: tokens,
      expectedRole: role,
      sessionCoordinator: coordinator,
      dioOverride: dio,
      refreshDioOverride: Dio(BaseOptions(baseUrl: 'https://example.test/v1')),
    );
  }

  final _MemoryTokens tokens;
  late final SessionCoordinator coordinator;
  late final ApiClient client;

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

class _MemoryTokens implements TokenStorage {
  _MemoryTokens(this.access);
  String? access;

  @override
  bool get isLoaded => true;
  @override
  String? get cachedAccessToken => access;
  @override
  String? get cachedRefreshToken => 'refresh';
  @override
  Future<void> warmUp() async {}
  @override
  Future<String?> readAccessToken() async => access;
  @override
  Future<String?> readRefreshToken() async => 'refresh';
  @override
  Future<StoredTokens?> readTokens() async =>
      StoredTokens(accessToken: access!, refreshToken: 'refresh');
  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    access = accessToken;
  }

  @override
  Future<void> clear() async {
    access = null;
  }
}

String _jwt(String role) {
  String encode(Map<String, Object> value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${encode({'alg': 'none'})}.${encode({'role': role, 'jti': 'moderation-test', 'exp': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000})}.signature';
}
