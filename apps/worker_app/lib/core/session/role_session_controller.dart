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

    // The mobile app must always open on the worker/company role chooser.
    // A role is remembered only for the current running session.
    await _storage.delete(key: _activeRoleKey);
    if (_disposed || operation != _operation) return;

    activeRole = null;
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
}
