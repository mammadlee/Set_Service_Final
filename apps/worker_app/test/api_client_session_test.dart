import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';

void main() {
  group('ApiClient session hardening', () {
    test('parallel 401 responses share one refresh and retry once', () async {
      final oldAccess = _jwt(role: 'worker');
      final newAccess = _jwt(role: 'worker');
      final storage = _MemoryTokenStorage(oldAccess, 'old-refresh');
      final coordinator = SessionCoordinator();
      addTearDown(coordinator.dispose);
      var refreshCalls = 0;

      final mainDio = _dioWithAdapter((options, _) async {
        final authorization = options.headers['authorization'];
        if (authorization == 'Bearer $newAccess') {
          return _jsonResponse(200, {'ok': true});
        }
        await Future<void>.delayed(const Duration(milliseconds: 25));
        return _jsonResponse(401, {'code': 'ACCESS_TOKEN_EXPIRED'});
      });
      final refreshDio = _dioWithAdapter((options, _) async {
        refreshCalls += 1;
        await Future<void>.delayed(const Duration(milliseconds: 75));
        return _jsonResponse(200, {
          'access_token': newAccess,
          'refresh_token': 'new-refresh',
        });
      });
      final client = ApiClient(
        baseUrl: 'https://example.test',
        tokenStorage: storage,
        expectedRole: 'worker',
        sessionCoordinator: coordinator,
        dioOverride: mainDio,
        refreshDioOverride: refreshDio,
      );

      final responses = await Future.wait(
        List.generate(5, (_) => client.dio.get<Map<String, dynamic>>('/me')),
      );

      expect(responses, hasLength(5));
      expect(responses.every((response) => response.data?['ok'] == true), true);
      expect(refreshCalls, 1);
      expect(storage.cachedAccessToken, newAccess);
      expect(storage.cachedRefreshToken, 'new-refresh');
      expect(storage.clearCount, 0);
    });

    test(
      'terminal refresh response clears tokens and invalidates UI',
      () async {
        final storage = _MemoryTokenStorage(_jwt(role: 'worker'), 'refresh');
        final coordinator = SessionCoordinator();
        addTearDown(coordinator.dispose);
        final invalidations = <SessionInvalidation>[];
        final subscription = coordinator.invalidations.listen(
          invalidations.add,
        );
        addTearDown(subscription.cancel);

        final client = ApiClient(
          baseUrl: 'https://example.test',
          tokenStorage: storage,
          expectedRole: 'worker',
          sessionCoordinator: coordinator,
          dioOverride: _dioWithAdapter(
            (_, __) async =>
                _jsonResponse(401, {'code': 'ACCESS_TOKEN_EXPIRED'}),
          ),
          refreshDioOverride: _dioWithAdapter(
            (_, __) async =>
                _jsonResponse(401, {'code': 'INVALID_REFRESH_TOKEN'}),
          ),
        );

        await expectLater(
          client.dio.get<Map<String, dynamic>>('/me'),
          throwsA(isA<DioException>()),
        );

        expect(storage.cachedAccessToken, isNull);
        expect(storage.cachedRefreshToken, isNull);
        expect(storage.clearCount, 1);
        expect(invalidations, hasLength(1));
        expect(invalidations.single.sessionKey, 'worker');
        expect(invalidations.single.code, 'INVALID_REFRESH_TOKEN');
      },
    );

    test('offline failure never clears a valid local session', () async {
      final access = _jwt(role: 'worker');
      final storage = _MemoryTokenStorage(access, 'refresh');
      final coordinator = SessionCoordinator();
      addTearDown(coordinator.dispose);
      final invalidations = <SessionInvalidation>[];
      final subscription = coordinator.invalidations.listen(invalidations.add);
      addTearDown(subscription.cancel);

      final client = ApiClient(
        baseUrl: 'https://example.test',
        tokenStorage: storage,
        expectedRole: 'worker',
        sessionCoordinator: coordinator,
        dioOverride: _dioWithAdapter((options, _) async {
          throw DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
            error: 'offline',
          );
        }),
        refreshDioOverride: _dioWithAdapter(
          (_, __) async => throw StateError('refresh must not run'),
        ),
      );

      await expectLater(
        client.dio.get<Map<String, dynamic>>('/me'),
        throwsA(isA<DioException>()),
      );

      expect(storage.cachedAccessToken, access);
      expect(storage.cachedRefreshToken, 'refresh');
      expect(storage.clearCount, 0);
      expect(invalidations, isEmpty);
      expect(coordinator.stateFor('worker'), SessionState.offlineAuthenticated);
    });

    test(
      'terminal 403 account response clears the protected session',
      () async {
        final access = _jwt(role: 'worker');
        final storage = _MemoryTokenStorage(access, 'refresh');
        final coordinator = SessionCoordinator();
        addTearDown(coordinator.dispose);

        final client = ApiClient(
          baseUrl: 'https://example.test',
          tokenStorage: storage,
          expectedRole: 'worker',
          sessionCoordinator: coordinator,
          dioOverride: _dioWithAdapter(
            (_, __) async => _jsonResponse(403, {'code': 'ACCOUNT_INACTIVE'}),
          ),
          refreshDioOverride: _dioWithAdapter(
            (_, __) async => throw StateError('refresh must not run'),
          ),
        );

        await expectLater(
          client.dio.get<Map<String, dynamic>>('/me'),
          throwsA(isA<DioException>()),
        );

        expect(storage.clearCount, 1);
        expect(coordinator.stateFor('worker'), SessionState.blocked);
      },
    );

    test('failed proactive refresh is not retried again after a 401', () async {
      final expiredAccess = _jwt(
        role: 'worker',
        expiresAt: DateTime.now().subtract(const Duration(minutes: 1)),
      );
      final storage = _MemoryTokenStorage(expiredAccess, 'refresh');
      final coordinator = SessionCoordinator();
      addTearDown(coordinator.dispose);
      var refreshCalls = 0;

      final client = ApiClient(
        baseUrl: 'https://example.test',
        tokenStorage: storage,
        expectedRole: 'worker',
        sessionCoordinator: coordinator,
        dioOverride: _dioWithAdapter(
          (_, __) async => _jsonResponse(401, {'code': 'ACCESS_TOKEN_EXPIRED'}),
        ),
        refreshDioOverride: _dioWithAdapter((options, _) async {
          refreshCalls += 1;
          return _jsonResponse(503, {'code': 'SERVICE_UNAVAILABLE'});
        }),
      );

      await expectLater(
        client.dio.get<Map<String, dynamic>>('/me'),
        throwsA(isA<DioException>()),
      );

      expect(refreshCalls, 1);
      expect(storage.cachedAccessToken, expiredAccess);
      expect(storage.cachedRefreshToken, 'refresh');
      expect(storage.clearCount, 0);
    });

    test(
      'multipart body is rebuilt for a single retry after refresh',
      () async {
        final oldAccess = _jwt(role: 'worker');
        final newAccess = _jwt(role: 'worker');
        final storage = _MemoryTokenStorage(oldAccess, 'old-refresh');
        final coordinator = SessionCoordinator();
        addTearDown(coordinator.dispose);
        final uploadedByteCounts = <int>[];

        final client = ApiClient(
          baseUrl: 'https://example.test',
          tokenStorage: storage,
          expectedRole: 'worker',
          sessionCoordinator: coordinator,
          dioOverride: _dioWithAdapter((options, requestBytes) async {
            uploadedByteCounts.add(requestBytes.length);
            if (options.headers['authorization'] == 'Bearer $newAccess') {
              return _jsonResponse(200, {'ok': true});
            }
            return _jsonResponse(401, {'code': 'ACCESS_TOKEN_EXPIRED'});
          }),
          refreshDioOverride: _dioWithAdapter(
            (_, __) async => _jsonResponse(200, {
              'access_token': newAccess,
              'refresh_token': 'new-refresh',
            }),
          ),
        );

        final response = await client.dio.post<Map<String, dynamic>>(
          '/upload',
          data: FormData.fromMap({
            'file': MultipartFile.fromBytes(
              Uint8List.fromList([1, 2, 3, 4]),
              filename: 'document.pdf',
            ),
          }),
        );

        expect(response.data?['ok'], true);
        expect(uploadedByteCounts, hasLength(2));
        expect(uploadedByteCounts.every((count) => count > 4), true);
      },
    );

    test('non-replayable request is never automatically sent twice', () async {
      final oldAccess = _jwt(role: 'worker');
      final newAccess = _jwt(role: 'worker');
      final storage = _MemoryTokenStorage(oldAccess, 'old-refresh');
      final coordinator = SessionCoordinator();
      addTearDown(coordinator.dispose);
      var protectedCalls = 0;

      final client = ApiClient(
        baseUrl: 'https://example.test',
        tokenStorage: storage,
        expectedRole: 'worker',
        sessionCoordinator: coordinator,
        dioOverride: _dioWithAdapter((_, __) async {
          protectedCalls += 1;
          return _jsonResponse(401, {'code': 'ACCESS_TOKEN_EXPIRED'});
        }),
        refreshDioOverride: _dioWithAdapter(
          (_, __) async => _jsonResponse(200, {
            'access_token': newAccess,
            'refresh_token': 'new-refresh',
          }),
        ),
      );

      await expectLater(
        client.dio.post<void>(
          '/stream',
          data: Stream<Uint8List>.value(Uint8List.fromList([1, 2, 3])),
          options: Options(contentType: 'application/octet-stream'),
        ),
        throwsA(isA<DioException>()),
      );

      expect(protectedCalls, 1);
      expect(storage.cachedAccessToken, newAccess);
      expect(storage.cachedRefreshToken, 'new-refresh');
    });

    test('coordinator ignores non-terminal invalidation codes', () async {
      final coordinator = SessionCoordinator();
      addTearDown(coordinator.dispose);
      final invalidations = <SessionInvalidation>[];
      final subscription = coordinator.invalidations.listen(invalidations.add);
      addTearDown(subscription.cancel);

      coordinator.notifyInvalidated(
        sessionKey: 'worker',
        code: 'NETWORK_ERROR',
      );
      coordinator.notifyInvalidated(
        sessionKey: 'worker',
        code: 'ACCOUNT_DISABLED',
      );

      expect(invalidations, hasLength(1));
      expect(invalidations.single.code, 'ACCOUNT_DISABLED');
      expect(coordinator.stateFor('worker'), SessionState.blocked);
    });

    test('refresh reuse is a terminal expired session state', () async {
      final coordinator = SessionCoordinator();
      addTearDown(coordinator.dispose);

      coordinator.notifyInvalidated(
        sessionKey: 'company',
        code: 'REFRESH_TOKEN_REUSE',
      );

      expect(coordinator.stateFor('company'), SessionState.expired);
    });
  });
}

typedef _AdapterHandler =
    Future<ResponseBody> Function(
      RequestOptions options,
      Uint8List requestBytes,
    );

Dio _dioWithAdapter(_AdapterHandler handler) {
  final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
  dio.httpClientAdapter = _CallbackAdapter(handler);
  return dio;
}

class _CallbackAdapter implements HttpClientAdapter {
  _CallbackAdapter(this.handler);

  final _AdapterHandler handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final builder = BytesBuilder(copy: false);
    if (requestStream != null) {
      await for (final chunk in requestStream) {
        builder.add(chunk);
      }
    }
    return handler(options, builder.takeBytes());
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

String _jwt({required String role, DateTime? expiresAt}) {
  final header = base64Url
      .encode(utf8.encode(jsonEncode({'alg': 'none'})))
      .replaceAll('=', '');
  final payload = base64Url
      .encode(
        utf8.encode(
          jsonEncode({
            'role': role,
            'jti': _jwtSequence++,
            'exp':
                (expiresAt ?? DateTime.now().add(const Duration(hours: 1)))
                    .millisecondsSinceEpoch ~/
                1000,
          }),
        ),
      )
      .replaceAll('=', '');
  return '$header.$payload.signature';
}

var _jwtSequence = 0;

class _MemoryTokenStorage implements TokenStorage {
  _MemoryTokenStorage(this._accessToken, this._refreshToken);

  String? _accessToken;
  String? _refreshToken;
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
    final access = _accessToken;
    final refresh = _refreshToken;
    if (access == null || refresh == null) return null;
    return StoredTokens(accessToken: access, refreshToken: refresh);
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
    clearCount += 1;
    _accessToken = null;
    _refreshToken = null;
  }
}
