import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'secure_storage_config.dart';
import 'token_storage.dart';

class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({
    String namespace = 'worker',
    FlutterSecureStorage? storage,
  }) : _accessTokenKey = 'setservice_${namespace}_access_token',
       _refreshTokenKey = 'setservice_${namespace}_refresh_token',
       _storage = storage ?? SecureStorageConfig.storage;

  final String _accessTokenKey;
  final String _refreshTokenKey;

  final FlutterSecureStorage _storage;
  String? _cachedAccessToken;
  String? _cachedRefreshToken;
  bool _isLoaded = false;
  Future<void>? _warmUpFuture;

  @override
  bool get isLoaded => _isLoaded;

  @override
  String? get cachedAccessToken => _cachedAccessToken;

  @override
  String? get cachedRefreshToken => _cachedRefreshToken;

  @override
  Future<void> warmUp() async {
    if (_isLoaded) return Future<void>.value();
    final existing = _warmUpFuture;
    if (existing != null) return existing;

    final loading = _loadFromSecureStorage();
    _warmUpFuture = loading;
    try {
      await loading;
    } finally {
      if (!_isLoaded) _warmUpFuture = null;
    }
  }

  Future<void> _loadFromSecureStorage() async {
    final values = await Future.wait<String?>([
      _storage.read(key: _accessTokenKey),
      _storage.read(key: _refreshTokenKey),
    ]);
    _cachedAccessToken = values[0];
    _cachedRefreshToken = values[1];
    _isLoaded = true;
  }

  @override
  Future<StoredTokens?> readTokens() async {
    await warmUp();
    final accessToken = _cachedAccessToken;
    final refreshToken = _cachedRefreshToken;
    if (accessToken == null || refreshToken == null) return null;
    return StoredTokens(accessToken: accessToken, refreshToken: refreshToken);
  }

  @override
  Future<String?> readAccessToken() async {
    await warmUp();
    return _cachedAccessToken;
  }

  @override
  Future<String?> readRefreshToken() async {
    await warmUp();
    return _cachedRefreshToken;
  }

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _finishPendingWarmUp();
    _cachedAccessToken = accessToken;
    _cachedRefreshToken = refreshToken;
    _isLoaded = true;
    _warmUpFuture = Future<void>.value();
    await Future.wait<void>([
      _storage.write(key: _accessTokenKey, value: accessToken),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
    ]);
  }

  @override
  Future<void> clear() async {
    await _finishPendingWarmUp();
    _cachedAccessToken = null;
    _cachedRefreshToken = null;
    _isLoaded = true;
    _warmUpFuture = Future<void>.value();
    await Future.wait<void>([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
    ]);
  }

  Future<void> _finishPendingWarmUp() async {
    final pending = _warmUpFuture;
    if (_isLoaded || pending == null) return;
    try {
      await pending;
    } catch (_) {
      // Login/logout must still update the cache if a device storage read fails.
    }
  }
}
