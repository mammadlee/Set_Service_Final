import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/features/worker/data/worker_repository.dart';

void main() {
  test(
    'account deletion sends the explicit destructive confirmation',
    () async {
      RequestOptions? captured;
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test/v1'));
      dio.httpClientAdapter = _CallbackAdapter((options) async {
        captured = options;
        return ResponseBody.fromString(
          jsonEncode({'status': 'accepted'}),
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });
      final coordinator = SessionCoordinator();
      addTearDown(coordinator.dispose);
      final client = ApiClient(
        baseUrl: 'https://example.test/v1',
        tokenStorage: _MemoryTokenStorage(_jwt(), 'refresh-token'),
        expectedRole: 'worker',
        sessionCoordinator: coordinator,
        dioOverride: dio,
        refreshDioOverride: Dio(
          BaseOptions(baseUrl: 'https://example.test/v1'),
        ),
      );

      await WorkerRepository(apiClient: client).deleteMyAccount();

      expect(captured?.method, 'POST');
      expect(captured?.path, '/workers/me/account-deletion-request');
      expect(captured?.data, {'confirm': true});
    },
  );
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
    _accessToken = accessToken;
    _refreshToken = refreshToken;
  }

  @override
  Future<void> clear() async {
    _accessToken = null;
    _refreshToken = null;
  }
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
            'jti': 'account-deletion-test',
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
