import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/auth/jwt_utils.dart';
import '../../../core/storage/token_storage.dart';
import '../../../shared/app_strings.dart';
import 'models/auth_models.dart';

class AuthRepository {
  AuthRepository({
    required ApiClient apiClient,
    required TokenStorage tokenStorage,
  }) : _dio = apiClient.dio,
       _tokenStorage = tokenStorage;

  final Dio _dio;
  final TokenStorage _tokenStorage;

  Future<OtpStartResult> registerWorker({
    required String fullName,
    required String phone,
    required String position,
    required List<String> positionIds,
    required List<String> skills,
    required List<String> languages,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/worker/register',
        data: {
          'full_name': fullName,
          'phone': phone,
          'position': position,
          'position_ids': positionIds,
          'skills': skills,
          'languages': languages,
          'documents': <Object>[],
        },
      );
      return OtpStartResult.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AuthSession> loginWorker({
    required String phone,
    required String password,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/worker/login',
        data: {'phone': phone, 'password': password},
      );
      final session = AuthSession.fromJson(response.data ?? const {});
      final payload = readAccessTokenPayload(session.accessToken);
      if (session.user.role != 'worker' ||
          payload?.role != 'worker' ||
          isAccessTokenExpired(payload)) {
        throw const ApiException(message: AppStrings.wrongRoleForWorker);
      }
      await _tokenStorage.saveTokens(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      );
      return session;
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<WorkerRegistrationVerification> completeWorkerRegistration({
    required String phone,
    String? otpCode,
    String? otpChallenge,
    required String password,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/worker/complete-registration',
        data: {
          'phone': phone,
          if (otpCode != null) 'otp_code': otpCode,
          if (otpChallenge != null) 'otp_challenge': otpChallenge,
          'password': password,
        },
      );
      return WorkerRegistrationVerification.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<OtpVerificationResult> verifyOtp({
    String? phone,
    String? email,
    required String purpose,
    required String otpCode,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/verify-otp',
        data: {
          if (phone != null) 'phone': phone,
          if (email != null) 'email': email,
          'method': email == null ? 'phone' : 'email',
          'purpose': purpose,
          'otp_code': otpCode,
        },
      );
      return OtpVerificationResult.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<OtpStartResult> forgotWorkerPassword({
    String? phone,
    String? email,
    required String method,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/worker/forgot-password',
        data: {
          'method': method,
          if (phone != null) 'phone': phone,
          if (email != null) 'email': email,
        },
      );
      return OtpStartResult.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> resetWorkerPassword({
    String? phone,
    String? email,
    required String method,
    String? otpCode,
    String? otpChallenge,
    required String password,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/worker/reset-password',
        data: {
          'method': method,
          if (phone != null) 'phone': phone,
          if (email != null) 'email': email,
          if (otpCode != null) 'otp_code': otpCode,
          if (otpChallenge != null) 'otp_challenge': otpChallenge,
          'password': password,
        },
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<WorkerMe> getWorkerProfile() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/workers/me');
      return WorkerMe.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> logout() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    try {
      if (refreshToken != null && refreshToken.isNotEmpty) {
        await _dio.post<void>(
          '/auth/logout',
          data: {'refresh_token': refreshToken},
          options: Options(extra: {'skipAuthRefresh': true}),
        );
      }
    } catch (_) {
      // Local token clearing is still required if the network request fails.
    } finally {
      await _tokenStorage.clear();
    }
  }

  Future<void> clearLocalSession() => _tokenStorage.clear();

  Future<bool> hasStoredTokens() async {
    final tokens = await _tokenStorage.readTokens();
    return tokens != null;
  }
}
