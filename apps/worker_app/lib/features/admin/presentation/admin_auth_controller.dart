import 'package:flutter/foundation.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/push/push_registration_service.dart';
import '../../../shared/app_strings.dart';
import '../data/admin_repository.dart';

class AdminAuthController extends ChangeNotifier {
  AdminAuthController(this._repository, this._pushRegistrationService);

  final AdminRepository _repository;
  final PushRegistrationService _pushRegistrationService;

  AdminAuthState state = AdminAuthState.splash;
  String? adminName;
  String? adminRole;
  List<String> permissions = const [];
  String? errorMessage;
  String? successMessage;
  bool isSubmitting = false;
  bool _disposed = false;

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
    state = AdminAuthState.splash;
    notifyListeners();
    final session = await _repository.ensureValidStoredSession();
    if (session != null) {
      adminName = session.user.name;
      adminRole = session.user.role;
      permissions = session.user.permissions;
      state = AdminAuthState.authenticated;
    } else {
      adminName = null;
      adminRole = null;
      permissions = const [];
      state = AdminAuthState.unauthenticated;
    }
    notifyListeners();
  }

  Future<void> loginAdmin({
    required String email,
    required String password,
  }) async {
    await _submit(() async {
      final session = await _repository.loginAdmin(
        email: email,
        password: password,
      );
      adminName = session.user.name;
      adminRole = session.user.role;
      permissions = session.user.permissions;
      state = AdminAuthState.authenticated;
    });
  }

  Future<void> forgotPassword(String email) async {
    await _submit(() async {
      await _repository.forgotPassword(email);
      successMessage = AppStrings.adminResetRequested;
    });
  }

  Future<void> registerPushForActiveSession() async {
    if (state == AdminAuthState.authenticated) {
      await _pushRegistrationService.registerDeviceToken();
    }
  }

  Future<void> logout() async {
    isSubmitting = true;
    notifyListeners();
    try {
      await _pushRegistrationService.unregisterDeviceToken();
      await _repository.logout();
    } finally {
      adminName = null;
      adminRole = null;
      permissions = const [];
      errorMessage = null;
      successMessage = null;
      state = AdminAuthState.unauthenticated;
      isSubmitting = false;
      notifyListeners();
    }
  }

  void backToLogin() {
    errorMessage = null;
    successMessage = null;
    state = AdminAuthState.unauthenticated;
    notifyListeners();
  }

  Future<void> _submit(Future<void> Function() action) async {
    isSubmitting = true;
    errorMessage = null;
    successMessage = null;
    notifyListeners();
    try {
      await action();
    } on ApiException catch (error) {
      errorMessage = error.message;
    } catch (_) {
      errorMessage = AppStrings.unknownError;
    } finally {
      isSubmitting = false;
      notifyListeners();
    }
  }
}

extension AdminPermissionAccess on AdminAuthController {
  bool hasPermission(String permission) {
    if (adminRole == 'super_admin') return true;
    return adminRole == 'admin' && permissions.contains(permission);
  }
}

enum AdminAuthState { splash, unauthenticated, authenticated }
