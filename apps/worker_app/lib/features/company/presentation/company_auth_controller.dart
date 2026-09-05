import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/push/push_registration_service.dart';
import '../../../core/session/session_coordinator.dart';
import '../../../shared/app_strings.dart';
import '../data/company_repository.dart';

class CompanyAuthController extends ChangeNotifier {
  CompanyAuthController(
    this._repository,
    this._pushRegistrationService,
    this._sessionCoordinator,
  ) {
    _sessionInvalidationSubscription = _sessionCoordinator.invalidations
        .where((event) => event.sessionKey == 'company')
        .listen(_handleSessionInvalidation);
  }

  final CompanyRepository _repository;
  final PushRegistrationService _pushRegistrationService;
  final SessionCoordinator _sessionCoordinator;
  late final StreamSubscription<SessionInvalidation>
  _sessionInvalidationSubscription;

  CompanyAuthState state = CompanyAuthState.splash;
  String? pendingPhone;
  String? pendingEmail;
  String? pendingOtpCode;
  String? pendingOtpChallenge;
  CompanyPendingOtpPurpose? pendingPurpose;
  String? blockedStatus;
  String? errorMessage;
  String? successMessage;
  String? companyName;
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
    state = CompanyAuthState.splash;
    notifyListeners();

    if (!await _repository.hasStoredTokens()) {
      state = CompanyAuthState.unauthenticated;
      _notifySessionState(SessionState.unauthenticated);
      notifyListeners();
      return;
    }

    try {
      final me = await _repository.getMe();
      companyName = me.name;
      state = me.status == 'approved'
          ? CompanyAuthState.authenticated
          : _blockedState(me.status);
      _notifySessionState(
        state == CompanyAuthState.authenticated
            ? SessionState.authenticated
            : SessionState.blocked,
      );
    } on ApiException catch (error) {
      if (_applyApprovalError(error)) {
        await _repository.clearLocalSession();
        _notifySessionState(SessionState.blocked, code: error.code);
      } else if (isTerminalSessionErrorCode(error.code)) {
        await _repository.clearLocalSession();
        state = CompanyAuthState.unauthenticated;
      } else {
        state = CompanyAuthState.authenticated;
        errorMessage = error.message;
        _notifySessionState(SessionState.offlineAuthenticated);
      }
    } catch (_) {
      state = CompanyAuthState.authenticated;
      errorMessage = AppStrings.unknownError;
      _notifySessionState(SessionState.offlineAuthenticated);
    }
    notifyListeners();
  }

  void _handleSessionInvalidation(SessionInvalidation event) {
    pendingPhone = null;
    pendingEmail = null;
    pendingOtpCode = null;
    pendingOtpChallenge = null;
    pendingPurpose = null;
    blockedStatus = null;
    companyName = null;
    successMessage = null;
    errorMessage = AppStrings.backendError(code: event.code);
    state = CompanyAuthState.unauthenticated;
    notifyListeners();
  }

  void clearTransientMessages() {
    if (errorMessage == null && successMessage == null) return;
    errorMessage = null;
    successMessage = null;
    notifyListeners();
  }

  Future<void> registerCompany({
    required String name,
    required String contactName,
    required String email,
    required String phone,
  }) async {
    await _submit(() async {
      await _repository.registerCompany(
        name: name,
        contactName: contactName,
        email: email,
        phone: phone,
      );
      pendingPhone = phone;
      pendingEmail = email;
      pendingPurpose = CompanyPendingOtpPurpose.registration;
      state = CompanyAuthState.otpRequired;
    });
  }

  Future<void> loginCompany({
    required String email,
    required String password,
  }) async {
    await _submit(() async {
      final session = await _repository.loginCompany(
        email: email,
        password: password,
      );
      companyName = session.user.name;
      state = CompanyAuthState.authenticated;
      _notifySessionState(SessionState.authenticated);
    });
  }

  Future<void> forgotPasswordByEmail(String email) async {
    await _submit(() async {
      await _repository.forgotPassword(email: email, method: 'email');
      pendingEmail = email;
      pendingPhone = null;
      pendingPurpose = CompanyPendingOtpPurpose.passwordReset;
      state = CompanyAuthState.otpRequired;
    });
  }

  Future<void> forgotPasswordByPhone(String phone) async {
    await _submit(() async {
      await _repository.forgotPassword(phone: phone, method: 'phone');
      pendingPhone = phone;
      pendingEmail = null;
      pendingPurpose = CompanyPendingOtpPurpose.passwordReset;
      state = CompanyAuthState.otpRequired;
    });
  }

  Future<void> completeOtp({required String password}) async {
    final email = pendingEmail;
    final phone = pendingPhone;
    final otpCode = pendingOtpCode;
    final otpChallenge = pendingOtpChallenge;
    if ((otpCode == null && otpChallenge == null) || pendingPurpose == null) {
      errorMessage = AppStrings.otpSessionExpired;
      state = CompanyAuthState.unauthenticated;
      notifyListeners();
      return;
    }

    await _submit(() async {
      if (pendingPurpose == CompanyPendingOtpPurpose.registration) {
        if (email == null || email.isEmpty) {
          errorMessage = AppStrings.otpSessionExpired;
          state = CompanyAuthState.unauthenticated;
          return;
        }
        await _repository.completeCompanyRegistration(
          email: email,
          otpCode: otpCode,
          otpChallenge: otpChallenge,
          password: password,
        );
        pendingOtpCode = null;
        pendingOtpChallenge = null;
        errorMessage = null;
        state = CompanyAuthState.pendingApproval;
        return;
      }
      if (email == null && phone == null) {
        errorMessage = AppStrings.otpSessionExpired;
        state = CompanyAuthState.unauthenticated;
        return;
      }
      await _repository.resetPassword(
        email: email,
        phone: phone,
        method: email == null ? 'phone' : 'email',
        otpCode: otpCode,
        otpChallenge: otpChallenge,
        password: password,
      );
      pendingOtpCode = null;
      pendingOtpChallenge = null;
      successMessage = AppStrings.passwordResetSuccess;
      state = CompanyAuthState.unauthenticated;
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
      state = CompanyAuthState.unauthenticated;
      notifyListeners();
      return;
    }

    await _submit(() async {
      final result = await _repository.verifyOtp(
        phone: phone,
        email: purpose == CompanyPendingOtpPurpose.passwordReset ? email : null,
        purpose: purpose.apiValue,
        otpCode: otpCode.trim(),
      );
      pendingOtpCode = otpCode.trim();
      pendingOtpChallenge = result.otpChallenge;
      state = CompanyAuthState.passwordRequired;
    });
  }

  Future<void> registerPushForActiveSession() async {
    if (state == CompanyAuthState.authenticated) {
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
      pendingPhone = null;
      pendingEmail = null;
      pendingOtpCode = null;
      pendingOtpChallenge = null;
      pendingPurpose = null;
      blockedStatus = null;
      errorMessage = null;
      successMessage = null;
      companyName = null;
      state = CompanyAuthState.unauthenticated;
      isSubmitting = false;
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
    state = CompanyAuthState.unauthenticated;
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
      if (!_applyApprovalError(error)) errorMessage = error.message;
    } catch (_) {
      errorMessage = AppStrings.unknownError;
    } finally {
      isSubmitting = false;
      notifyListeners();
    }
  }

  bool _applyApprovalError(ApiException error) {
    if (error.code != 'COMPANY_NOT_APPROVED' &&
        error.code != 'ACCOUNT_NOT_APPROVED') {
      return false;
    }
    final details = error.details;
    final status = details is Map ? details['status']?.toString() : null;
    blockedStatus = status ?? 'pending_approval';
    state = _blockedState(blockedStatus!);
    errorMessage = state == CompanyAuthState.pendingApproval
        ? null
        : _messageForStatus(blockedStatus!);
    return true;
  }

  CompanyAuthState _blockedState(String status) {
    blockedStatus = status;
    if (status == 'pending_approval') return CompanyAuthState.pendingApproval;
    return CompanyAuthState.accountBlocked;
  }

  String _messageForStatus(String status) {
    return switch (status) {
      'pending_approval' => AppStrings.companyPendingApprovalMessage,
      'rejected' => AppStrings.companyRejectedMessage,
      'suspended' => AppStrings.companySuspendedMessage,
      'inactive' => AppStrings.companyInactiveMessage,
      _ => AppStrings.companyPendingApprovalMessage,
    };
  }

  void _notifySessionState(SessionState sessionState, {String? code}) {
    _sessionCoordinator.notifyState(
      sessionKey: 'company',
      state: sessionState,
      code: code,
    );
  }
}

enum CompanyPendingOtpPurpose { registration, passwordReset }

extension CompanyPendingOtpPurposeApiValue on CompanyPendingOtpPurpose {
  String get apiValue {
    return switch (this) {
      CompanyPendingOtpPurpose.registration => 'company_registration',
      CompanyPendingOtpPurpose.passwordReset => 'company_password_reset',
    };
  }
}

enum CompanyAuthState {
  splash,
  unauthenticated,
  otpRequired,
  passwordRequired,
  pendingApproval,
  accountBlocked,
  authenticated,
}
