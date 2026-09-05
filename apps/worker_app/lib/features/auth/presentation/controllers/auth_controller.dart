import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/push/push_registration_service.dart';
import '../../../../core/session/session_coordinator.dart';
import '../../../../shared/app_strings.dart';
import '../../data/auth_repository.dart';
import '../../data/models/auth_models.dart';

class AuthController extends ChangeNotifier {
  AuthController(
    this._repository,
    this._pushRegistrationService,
    this._sessionCoordinator,
  ) {
    _sessionInvalidationSubscription = _sessionCoordinator.invalidations
        .where((event) => event.sessionKey == 'worker')
        .listen(_handleSessionInvalidation);
  }

  final AuthRepository _repository;
  final PushRegistrationService _pushRegistrationService;
  final SessionCoordinator _sessionCoordinator;
  late final StreamSubscription<SessionInvalidation>
  _sessionInvalidationSubscription;

  AuthViewState state = AuthViewState.splash;
  WorkerMe? worker;
  String? pendingPhone;
  String? pendingEmail;
  String? pendingOtpCode;
  String? pendingOtpChallenge;
  OtpPurpose? pendingPurpose;
  String? blockedStatus;
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
    state = AuthViewState.splash;
    notifyListeners();

    final hasTokens = await _repository.hasStoredTokens();
    if (!hasTokens) {
      state = AuthViewState.unauthenticated;
      _notifySessionState(SessionState.unauthenticated);
      notifyListeners();
      return;
    }

    try {
      worker = await _repository.getWorkerProfile();
      state = _stateForWorkerStatus(worker?.status);
      _notifySessionState(
        state == AuthViewState.authenticated
            ? SessionState.authenticated
            : SessionState.blocked,
      );
    } on ApiException catch (error) {
      if (_applyAccountApprovalError(error)) {
        await _repository.clearLocalSession();
        _notifySessionState(SessionState.blocked, code: error.code);
      } else if (isTerminalSessionErrorCode(error.code)) {
        await _repository.clearLocalSession();
        state = AuthViewState.unauthenticated;
      } else {
        state = AuthViewState.authenticated;
        errorMessage = error.message;
        _notifySessionState(SessionState.offlineAuthenticated);
      }
    } catch (_) {
      state = AuthViewState.authenticated;
      errorMessage = AppStrings.unknownError;
      _notifySessionState(SessionState.offlineAuthenticated);
    }
    notifyListeners();
  }

  void _handleSessionInvalidation(SessionInvalidation event) {
    worker = null;
    pendingPhone = null;
    pendingEmail = null;
    pendingOtpCode = null;
    pendingOtpChallenge = null;
    pendingPurpose = null;
    blockedStatus = null;
    successMessage = null;
    errorMessage = AppStrings.backendError(code: event.code);
    state = AuthViewState.unauthenticated;
    notifyListeners();
  }

  void clearTransientMessages() {
    if (errorMessage == null && successMessage == null) return;
    errorMessage = null;
    successMessage = null;
    notifyListeners();
  }

  Future<void> registerWorker({
    required String fullName,
    required String phone,
    required String position,
    required List<String> positionIds,
    required List<String> skills,
    required List<String> languages,
  }) async {
    await _submit(() async {
      await _repository.registerWorker(
        fullName: fullName,
        phone: phone,
        position: position,
        positionIds: positionIds,
        skills: skills,
        languages: languages,
      );
      pendingPhone = phone;
      pendingPurpose = OtpPurpose.workerRegistration;
      errorMessage = null;
      state = AuthViewState.otpRequired;
    });
  }

  Future<void> loginWorker({
    required String phone,
    required String password,
  }) async {
    await _submit(() async {
      await _repository.loginWorker(phone: phone, password: password);
      worker = await _repository.getWorkerProfile();
      errorMessage = null;
      state = _stateForWorkerStatus(worker?.status);
      _notifySessionState(
        state == AuthViewState.authenticated
            ? SessionState.authenticated
            : SessionState.blocked,
      );
    });
  }

  Future<void> completeRegistration({required String password}) async {
    final phone = pendingPhone;
    final otpCode = pendingOtpCode;
    final otpChallenge = pendingOtpChallenge;
    final purpose = pendingPurpose;
    if (phone == null ||
        (otpCode == null && otpChallenge == null) ||
        purpose != OtpPurpose.workerRegistration) {
      errorMessage = AppStrings.otpSessionExpired;
      state = AuthViewState.unauthenticated;
      notifyListeners();
      return;
    }

    await _submit(() async {
      final result = await _repository.completeWorkerRegistration(
        phone: phone,
        otpCode: otpCode,
        otpChallenge: otpChallenge,
        password: password,
      );
      pendingOtpCode = null;
      pendingOtpChallenge = null;
      errorMessage = null;
      state = _stateForWorkerStatus(result.status);
    });
  }

  Future<void> forgotPasswordByPhone(String phone) async {
    await _submit(() async {
      await _repository.forgotWorkerPassword(phone: phone, method: 'phone');
      pendingPhone = phone;
      pendingEmail = null;
      pendingPurpose = OtpPurpose.workerPasswordReset;
      state = AuthViewState.otpRequired;
    });
  }

  Future<void> forgotPasswordByEmail(String email) async {
    await _submit(() async {
      await _repository.forgotWorkerPassword(email: email, method: 'email');
      pendingEmail = email;
      pendingPhone = null;
      pendingPurpose = OtpPurpose.workerPasswordReset;
      state = AuthViewState.otpRequired;
    });
  }

  Future<void> resetPassword({required String password}) async {
    final phone = pendingPhone;
    final otpCode = pendingOtpCode;
    final otpChallenge = pendingOtpChallenge;
    final purpose = pendingPurpose;
    final email = pendingEmail;
    if ((phone == null && email == null) ||
        (otpCode == null && otpChallenge == null) ||
        purpose != OtpPurpose.workerPasswordReset) {
      errorMessage = AppStrings.otpSessionExpired;
      state = AuthViewState.unauthenticated;
      notifyListeners();
      return;
    }

    await _submit(() async {
      await _repository.resetWorkerPassword(
        phone: phone,
        email: email,
        method: email == null ? 'phone' : 'email',
        otpCode: otpCode,
        otpChallenge: otpChallenge,
        password: password,
      );
      successMessage = AppStrings.passwordResetSuccess;
      state = AuthViewState.unauthenticated;
      pendingPhone = null;
      pendingEmail = null;
      pendingOtpCode = null;
      pendingOtpChallenge = null;
      pendingPurpose = null;
    });
  }

  Future<void> submitOtpCode(String otpCode) async {
    if (!RegExp(r'^\d{6}$').hasMatch(otpCode.trim())) {
      errorMessage = AppStrings.otpValidation;
      notifyListeners();
      return;
    }
    final phone = pendingPhone;
    final email = pendingEmail;
    final purpose = pendingPurpose;
    if (purpose == null || (phone == null && email == null)) {
      errorMessage = AppStrings.otpSessionExpired;
      state = AuthViewState.unauthenticated;
      notifyListeners();
      return;
    }

    await _submit(() async {
      final result = await _repository.verifyOtp(
        phone: phone,
        email: email,
        purpose: purpose.apiValue,
        otpCode: otpCode.trim(),
      );
      pendingOtpCode = otpCode.trim();
      pendingOtpChallenge = result.otpChallenge;
      errorMessage = null;
      state = AuthViewState.passwordRequired;
    });
  }

  Future<void> registerPushForActiveSession() async {
    if (state == AuthViewState.authenticated) {
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
      worker = null;
      pendingPhone = null;
      pendingEmail = null;
      pendingOtpCode = null;
      pendingOtpChallenge = null;
      pendingPurpose = null;
      blockedStatus = null;
      errorMessage = null;
      successMessage = null;
      isSubmitting = false;
      state = AuthViewState.unauthenticated;
      _notifySessionState(SessionState.unauthenticated);
      notifyListeners();
    }
  }

  void backToLogin() {
    pendingPhone = null;
    pendingEmail = null;
    pendingOtpCode = null;
    pendingOtpChallenge = null;
    pendingPurpose = null;
    blockedStatus = null;
    errorMessage = null;
    successMessage = null;
    state = AuthViewState.unauthenticated;
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
      errorMessage = _friendlyMessage(error);
    } catch (_) {
      errorMessage = AppStrings.unknownError;
    } finally {
      isSubmitting = false;
      notifyListeners();
    }
  }

  String _friendlyMessage(ApiException error) {
    if (_applyAccountApprovalError(error)) {
      return errorMessage ?? AppStrings.backendError(code: error.code);
    }
    return error.message;
  }

  bool _applyAccountApprovalError(ApiException error) {
    if (error.code != 'WORKER_NOT_APPROVED' &&
        error.code != 'ACCOUNT_NOT_APPROVED') {
      return false;
    }

    final details = error.details;
    final status = details is Map ? details['status']?.toString() : null;
    if (status == null || status.isEmpty) return false;

    state = _stateForWorkerStatus(status);
    errorMessage = state == AuthViewState.pendingApproval
        ? null
        : AppStrings.accountMessageForStatus(status);
    return true;
  }

  AuthViewState _stateForWorkerStatus(String? status) {
    if (status == 'approved') return AuthViewState.authenticated;
    if (status == 'pending_approval' || status == 'pending_otp') {
      blockedStatus = status;
      return AuthViewState.pendingApproval;
    }
    if (status == 'rejected' || status == 'suspended' || status == 'inactive') {
      blockedStatus = status;
      return AuthViewState.accountBlocked;
    }
    return AuthViewState.pendingApproval;
  }

  void _notifySessionState(SessionState sessionState, {String? code}) {
    _sessionCoordinator.notifyState(
      sessionKey: 'worker',
      state: sessionState,
      code: code,
    );
  }
}

enum AuthViewState {
  splash,
  unauthenticated,
  otpRequired,
  passwordRequired,
  pendingApproval,
  accountBlocked,
  authenticated,
}

enum OtpPurpose { workerRegistration, workerPasswordReset }

extension OtpPurposeApiValue on OtpPurpose {
  String get apiValue {
    return switch (this) {
      OtpPurpose.workerRegistration => 'worker_registration',
      OtpPurpose.workerPasswordReset => 'worker_password_reset',
    };
  }
}
