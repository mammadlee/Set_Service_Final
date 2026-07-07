import 'package:dio/dio.dart';

import '../../../core/auth/jwt_utils.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/token_storage.dart';
import '../../../shared/app_strings.dart';
import '../../../shared/models/mobile_models.dart';
import '../../assignments/data/models/assignment.dart';
import '../../attendance/data/models/attendance.dart';
import '../../attendance/data/models/kiosk_session.dart';
import '../../auth/data/models/auth_models.dart';
import '../../notifications/data/models/notification_item.dart';

class CompanyRepository {
  CompanyRepository({
    required ApiClient apiClient,
    required TokenStorage tokenStorage,
  }) : _dio = apiClient.dio,
       _tokenStorage = tokenStorage;

  final Dio _dio;
  final TokenStorage _tokenStorage;

  Future<OtpStartResult> registerCompany({
    required String name,
    required String contactName,
    required String email,
    required String phone,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/company/register',
        data: {
          'name': name,
          'contact_name': contactName,
          'email': email,
          'phone': phone,
          'documents': <Object>[],
        },
      );
      return OtpStartResult.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> completeCompanyRegistration({
    required String email,
    String? otpCode,
    String? otpChallenge,
    required String password,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/company/complete-registration',
        data: {
          'email': email,
          if (otpCode != null) 'otp_code': otpCode,
          if (otpChallenge != null) 'otp_challenge': otpChallenge,
          'password': password,
        },
      );
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

  Future<AuthSession> loginCompany({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/company/login',
        data: {'email': email, 'password': password},
      );
      final session = AuthSession.fromJson(response.data ?? const {});
      final payload = readAccessTokenPayload(session.accessToken);
      if (session.user.role != 'company' ||
          payload?.role != 'company' ||
          isAccessTokenExpired(payload)) {
        throw const ApiException(message: AppStrings.wrongRoleForCompany);
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

  Future<OtpStartResult> forgotPassword({
    String? email,
    String? phone,
    required String method,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/company/forgot-password',
        data: {
          'method': method,
          if (email != null) 'email': email,
          if (phone != null) 'phone': phone,
        },
      );
      return OtpStartResult.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> resetPassword({
    String? email,
    String? phone,
    required String method,
    String? otpCode,
    String? otpChallenge,
    required String password,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/company/reset-password',
        data: {
          'method': method,
          if (email != null) 'email': email,
          if (phone != null) 'phone': phone,
          if (otpCode != null) 'otp_code': otpCode,
          if (otpChallenge != null) 'otp_challenge': otpChallenge,
          'password': password,
        },
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<MobileCompanyProfile> getMe() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/companies/me');
      return MobileCompanyProfile.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<MobileOrderPage> listOrders({String? status}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/orders',
        queryParameters: {
          'limit': 50,
          'sort': 'desc',
          if (status != null) 'status': status,
        },
      );
      return MobileOrderPage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<MobileOrder> getOrder(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/orders/$id');
      return MobileOrder.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<MobileOrder> createOrder({
    required String title,
    required String description,
    required List<CreateOrderCategoryInput> categoryItems,
    required DateTime start,
    required DateTime end,
    required String location,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/orders',
        data: {
          'title': title,
          'description': description,
          'category': categoryItems.first.category,
          'required_count': categoryItems.fold<int>(
            0,
            (sum, item) => sum + item.requiredCount,
          ),
          'category_items': categoryItems
              .map(
                (item) => {
                  'category': item.category,
                  'department_id': item.departmentId,
                  'subdepartment_id': item.subdepartmentId,
                  'position_id': item.positionId,
                  'required_count': item.requiredCount,
                  if (item.notes != null && item.notes!.trim().isNotEmpty)
                    'notes': item.notes!.trim(),
                },
              )
              .toList(),
          'start_datetime': start.toUtc().toIso8601String(),
          'end_datetime': end.toUtc().toIso8601String(),
          'location': location,
        },
      );
      return MobileOrder.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<MobileOrder> cancelOrder(String id) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/orders/$id/cancel',
      );
      return MobileOrder.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AssignmentPage> listAssignments({String? orderId}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/assignments',
        queryParameters: {
          'limit': 50,
          'sort': 'desc',
          if (orderId != null) 'order_id': orderId,
        },
      );
      return AssignmentPage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AttendancePage> listAttendance({
    String? orderId,
    String? assignmentId,
    int limit = 50,
    int page = 1,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/attendance',
        queryParameters: {
          'limit': limit,
          'page': page,
          'sort': 'desc',
          if (orderId != null) 'order_id': orderId,
          if (assignmentId != null) 'assignment_id': assignmentId,
        },
      );
      return AttendancePage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminReportSummary> getReportSummary({
    String? workerId,
    String? category,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/company/reports/summary',
        queryParameters: {
          if (workerId != null && workerId.isNotEmpty) 'worker_id': workerId,
          if (category != null && category.isNotEmpty) 'category': category,
          if (startDate != null) 'start_date': _dateOnly(startDate),
          if (endDate != null) 'end_date': _dateOnly(endDate),
        },
      );
      return AdminReportSummary.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<QrTokenResult> generateQrToken(String assignmentId) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/attendance/qr-token',
        data: {'assignment_id': assignmentId},
      );
      return QrTokenResult.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<KioskSessionResult> createKioskSession(String assignmentId) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/attendance/kiosk-sessions',
        data: {'assignment_id': assignmentId},
      );
      return KioskSessionResult.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> revokeKioskSession(String id) async {
    try {
      await _dio.delete<void>('/attendance/kiosk-sessions/$id');
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> rateWorker({
    required String assignmentId,
    required int score,
    String? feedback,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/ratings',
        data: {
          'assignment_id': assignmentId,
          'score': score,
          if (feedback != null && feedback.trim().isNotEmpty)
            'feedback': feedback.trim(),
        },
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<CompanyVisibleWorkerProfile> getWorkerProfile(String workerId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/workers/$workerId/company-profile',
      );
      return CompanyVisibleWorkerProfile.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<NotificationPage> listNotifications() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/notifications',
        queryParameters: {'limit': 50},
      );
      return NotificationPage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> markNotificationRead(String id) async {
    try {
      await _dio.patch<void>('/notifications/$id/read');
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

  Future<bool> hasStoredTokens() async =>
      (await _tokenStorage.readTokens()) != null;

  Future<void> clearLocalSession() => _tokenStorage.clear();

  String _dateOnly(DateTime value) {
    final local = value.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '${local.year}-$month-$day';
  }
}

class CreateOrderCategoryInput {
  const CreateOrderCategoryInput({
    required this.category,
    required this.departmentId,
    required this.subdepartmentId,
    required this.positionId,
    required this.requiredCount,
    this.notes,
  });

  final String category;
  final String departmentId;
  final String subdepartmentId;
  final String positionId;
  final int requiredCount;
  final String? notes;
}
