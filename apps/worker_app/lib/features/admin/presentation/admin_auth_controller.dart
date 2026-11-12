import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/push/push_registration_service.dart';
import '../../../core/session/session_coordinator.dart';
import '../../../shared/app_strings.dart';
import '../data/admin_repository.dart';

class AdminAuthController extends ChangeNotifier {
  AdminAuthController(
    this._repository,
    this._pushRegistrationService,
    this._sessionCoordinator,
  ) {
    _sessionInvalidationSubscription = _sessionCoordinator.invalidations
        .where((event) => event.sessionKey == 'super_admin')
        .listen(_handleSessionInvalidation);
  }

  final AdminRepository _repository;
  final PushRegistrationService _pushRegistrationService;
  final SessionCoordinator _sessionCoordinator;
  late final StreamSubscription<SessionInvalidation>
  _sessionInvalidationSubscription;

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
    unawaited(_sessionInvalidationSubscription.cancel());
    unawaited(_pushRegistrationService.dispose());
    super.dispose();
  }

  Future<void> bootstrap() async {
    state = AdminAuthState.splash;
    notifyListeners();
    try {
      final session = await _repository.ensureValidStoredSession();
      if (session != null) {
        adminName = session.user.name;
        adminRole = session.user.role;
        permissions = session.user.permissions;
        state = AdminAuthState.authenticated;
        _notifySessionState(SessionState.authenticated);
      } else {
        adminName = null;
        adminRole = null;
        permissions = const [];
        state = AdminAuthState.unauthenticated;
        _notifySessionState(SessionState.unauthenticated);
      }
    } on ApiException catch (error) {
      if (isTerminalSessionErrorCode(error.code)) {
        await _repository.clearLocalSession();
        state = AdminAuthState.unauthenticated;
      } else {
        // Preserve the locally stored admin session during offline startup.
        state = AdminAuthState.authenticated;
        errorMessage = error.message;
        _notifySessionState(SessionState.offlineAuthenticated);
      }
    } catch (_) {
      state = AdminAuthState.authenticated;
      errorMessage = AppStrings.unknownError;
      _notifySessionState(SessionState.offlineAuthenticated);
    }
    notifyListeners();
  }

  void _handleSessionInvalidation(SessionInvalidation event) {
    unawaited(_repository.clearLocalSession());
    adminName = null;
    adminRole = null;
    permissions = const [];
    successMessage = null;
    errorMessage = AppStrings.backendError(code: event.code);
    state = AdminAuthState.unauthenticated;
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
      _notifySessionState(SessionState.authenticated);
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
      _notifySessionState(SessionState.unauthenticated);
      notifyListeners();
    }
  }

  void backToLogin() {
    errorMessage = null;
    successMessage = null;
    state = AdminAuthState.unauthenticated;
    _notifySessionState(SessionState.unauthenticated);
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

  void _notifySessionState(SessionState sessionState, {String? code}) {
    _sessionCoordinator.notifyState(
      sessionKey: 'super_admin',
      state: sessionState,
      code: code,
    );
  }
}

extension AdminPermissionAccess on AdminAuthController {
  bool hasPermission(String permission) {
    if (adminRole == 'super_admin') return true;
    return adminRole == 'admin' && permissions.contains(permission);
  }
}

enum AdminAuthState { splash, unauthenticated, authenticated }
