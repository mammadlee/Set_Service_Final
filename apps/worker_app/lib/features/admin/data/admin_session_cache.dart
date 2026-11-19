import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/storage/secure_storage_config.dart';
import '../../auth/data/models/auth_models.dart';

abstract class AdminSessionCache {
  Future<AuthUser?> read();

  Future<void> save(AuthUser user);

  Future<void> clear();
}

class SecureAdminSessionCache implements AdminSessionCache {
  SecureAdminSessionCache({FlutterSecureStorage? storage})
    : _storage = storage ?? SecureStorageConfig.storage;

  static const _key = 'setservice_admin_session_metadata';

  final FlutterSecureStorage _storage;

  @override
  Future<AuthUser?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;
      return AuthUser.fromJson(decoded);
    } on FormatException {
      await clear();
      return null;
    }
  }

  @override
  Future<void> save(AuthUser user) {
    return _storage.write(
      key: _key,
      value: jsonEncode(<String, Object?>{
        'id': user.id,
        'phone': user.phone,
        'email': user.email,
        'role': user.role,
        'name': user.name,
        'permissions': user.permissions,
      }),
    );
  }

  @override
  Future<void> clear() => _storage.delete(key: _key);
}
