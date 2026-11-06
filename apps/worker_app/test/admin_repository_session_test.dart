import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/features/admin/data/admin_repository.dart';
import 'package:worker_app/features/admin/data/admin_session_cache.dart';
import 'package:worker_app/features/auth/data/models/auth_models.dart';

void main() {
  test(
    'valid admin access token bootstraps without a refresh request',
    () async {
      final access = _jwt(role: 'admin');
      final storage = _MemoryTokenStorage(access, 'refresh-token');
      final cache = _MemoryAdminSessionCache(
        const AuthUser(
          id: 'admin-1',
          phone: '',
          email: 'admin@example.test',
          role: 'admin',
          name: 'Admin',
          permissions: ['orders.read'],
        ),
      );
      final coordinator = SessionCoordinator();
      addTearDown(coordinator.dispose);
      var networkCalls = 0;
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
      dio.httpClientAdapter = _CallbackAdapter((_, __) async {
        networkCalls += 1;
        return _jsonResponse(500, {'code': 'UNEXPECTED_REQUEST'});
      });
      final client = ApiClient(
        baseUrl: 'https://example.test',
        tokenStorage: storage,
        expectedRole: 'super_admin',
        sessionCoordinator: coordinator,
        dioOverride: dio,
      );
      final repository = AdminRepository(
        apiClient: client,
        tokenStorage: storage,
        sessionCache: cache,
      );

      final session = await repository.ensureValidStoredSession();

      expect(networkCalls, 0);
      expect(session?.accessToken, access);
      expect(session?.user.name, 'Admin');
      expect(session?.user.permissions, ['orders.read']);
      expect(storage.clearCount, 0);
    },
  );

  test('legacy admin session refreshes once to populate metadata', () async {
    final oldAccess = _jwt(role: 'super_admin');
    final newAccess = _jwt(role: 'super_admin');
    final storage = _MemoryTokenStorage(oldAccess, 'old-refresh');
    final cache = _MemoryAdminSessionCache(null);
    final coordinator = SessionCoordinator();
    addTearDown(coordinator.dispose);
    var refreshCalls = 0;
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = _CallbackAdapter((options, _) async {
      expect(options.path, '/auth/refresh');
      refreshCalls += 1;
      return _jsonResponse(200, {
        'access_token': newAccess,
        'refresh_token': 'new-refresh',
        'user': {
          'id': 'root-1',
          'phone': '',
          'email': 'root@example.test',
          'role': 'super_admin',
          'name': 'Root Admin',
          'permissions': <String>[],
        },
      });
    });
    final client = ApiClient(
      baseUrl: 'https://example.test',
      tokenStorage: storage,
      expectedRole: 'super_admin',
      sessionCoordinator: coordinator,
      dioOverride: dio,
    );
    final repository = AdminRepository(
      apiClient: client,
      tokenStorage: storage,
      sessionCache: cache,
    );

    final session = await repository.ensureValidStoredSession();

    expect(refreshCalls, 1);
    expect(session?.user.name, 'Root Admin');
    expect(cache.user?.name, 'Root Admin');
    expect(storage.cachedAccessToken, newAccess);
  });
}

class _MemoryAdminSessionCache implements AdminSessionCache {
  _MemoryAdminSessionCache(this.user);

  AuthUser? user;

  @override
  Future<void> clear() async => user = null;

  @override
  Future<AuthUser?> read() async => user;

  @override
  Future<void> save(AuthUser value) async => user = value;
}

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

typedef _AdapterHandler =
    Future<ResponseBody> Function(
      RequestOptions options,
      Uint8List requestBytes,
    );

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

String _jwt({required String role}) {
  final header = base64Url
      .encode(utf8.encode(jsonEncode({'alg': 'none'})))
      .replaceAll('=', '');
  final payload = base64Url
      .encode(
        utf8.encode(
          jsonEncode({
            'role': role,
            'jti': 'admin-test-jti',
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
