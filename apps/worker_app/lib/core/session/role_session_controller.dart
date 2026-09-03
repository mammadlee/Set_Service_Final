import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../storage/secure_storage_config.dart';
import 'app_role.dart';

class RoleSessionController extends ChangeNotifier {
  RoleSessionController({FlutterSecureStorage? storage})
    : _storage = storage ?? SecureStorageConfig.storage;

  static const _activeRoleKey = 'setservice_active_role';

  final FlutterSecureStorage _storage;

  AppRole? activeRole;
  bool loading = true;
  bool _disposed = false;
  int _operation = 0;

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  Future<void> bootstrap() async {
    final operation = ++_operation;
    final rawRole = await _storage.read(key: _activeRoleKey);
    if (_disposed || operation != _operation) return;
    // This package is the worker mobile app. On a fresh install, enter the
    // worker flow directly instead of showing the multi-role chooser.
    activeRole = _roleFromValue(rawRole) ?? AppRole.worker;
    loading = false;
    notifyListeners();
  }

  Future<void> selectRole(AppRole role) async {
    final operation = ++_operation;
    await _storage.write(key: _activeRoleKey, value: role.name);
    if (_disposed || operation != _operation) return;
    activeRole = role;
    notifyListeners();
  }

  Future<void> clearRole() async {
    final operation = ++_operation;
    await _storage.delete(key: _activeRoleKey);
    if (_disposed || operation != _operation) return;
    activeRole = null;
    notifyListeners();
  }

  AppRole? _roleFromValue(String? value) {
    if (value == null) return null;
    for (final role in AppRole.values) {
      if (role.name == value) return role;
    }
    return null;
  }
}
