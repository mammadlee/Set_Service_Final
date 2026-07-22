import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'secure_storage_config.dart';
import 'token_storage.dart';

class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({
    String namespace = 'worker',
    FlutterSecureStorage? storage,
  }) : _tokenPairKey = 'setservice_${namespace}_token_pair_v1',
       _accessTokenKey = 'setservice_${namespace}_access_token',
       _refreshTokenKey = 'setservice_${namespace}_refresh_token',
       _storage = storage ?? SecureStorageConfig.storage;

  final String _tokenPairKey;
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
    final storedPair = decodeStoredTokenPair(
      await _storage.read(key: _tokenPairKey),
    );
    if (storedPair != null) {
      _cache(storedPair);
      return;
    }

    // One-time compatibility path for sessions written by older app versions.
    final values = await Future.wait<String?>([
      _storage.read(key: _accessTokenKey),
      _storage.read(key: _refreshTokenKey),
    ]);
    final legacyAccessToken = values[0];
    final legacyRefreshToken = values[1];
    if (legacyAccessToken != null && legacyRefreshToken != null) {
      final legacyPair = StoredTokens(
        accessToken: legacyAccessToken,
        refreshToken: legacyRefreshToken,
      );
      _cache(legacyPair);
      await _migrateLegacyPair(legacyPair);
      return;
    }

    _cachedAccessToken = null;
    _cachedRefreshToken = null;
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
    final pair = StoredTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
    );
    await _storage.write(
      key: _tokenPairKey,
      value: encodeStoredTokenPair(pair),
    );
    _cache(pair);
    await _deleteLegacyKeysBestEffort();
  }

  @override
  Future<void> clear() async {
    await _finishPendingWarmUp();
    _cachedAccessToken = null;
    _cachedRefreshToken = null;
    _isLoaded = true;
    _warmUpFuture = Future<void>.value();
    await _storage.delete(key: _tokenPairKey);
    await _deleteLegacyKeysBestEffort();
  }

  void _cache(StoredTokens pair) {
    _cachedAccessToken = pair.accessToken;
    _cachedRefreshToken = pair.refreshToken;
    _isLoaded = true;
    _warmUpFuture = Future<void>.value();
  }

  Future<void> _migrateLegacyPair(StoredTokens pair) async {
    try {
      await _storage.write(
        key: _tokenPairKey,
        value: encodeStoredTokenPair(pair),
      );
      await _deleteLegacyKeysBestEffort();
    } catch (_) {
      // The in-memory legacy session remains usable; migration retries on launch.
    }
  }

  Future<void> _deleteLegacyKeysBestEffort() async {
    try {
      await Future.wait<void>([
        _storage.delete(key: _accessTokenKey),
        _storage.delete(key: _refreshTokenKey),
      ]);
    } catch (_) {
      // The canonical pair is already committed/deleted as one secure value.
    }
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

String encodeStoredTokenPair(StoredTokens pair) => jsonEncode({
  'version': 1,
  'access_token': pair.accessToken,
  'refresh_token': pair.refreshToken,
});

StoredTokens? decodeStoredTokenPair(String? encoded) {
  if (encoded == null || encoded.isEmpty) return null;
  try {
    final value = jsonDecode(encoded);
    if (value is! Map<String, dynamic> || value['version'] != 1) return null;
    final accessToken = value['access_token'];
    final refreshToken = value['refresh_token'];
    if (accessToken is! String ||
        accessToken.isEmpty ||
        refreshToken is! String ||
        refreshToken.isEmpty) {
      return null;
    }
    return StoredTokens(accessToken: accessToken, refreshToken: refreshToken);
  } on FormatException {
    return null;
  }
}
