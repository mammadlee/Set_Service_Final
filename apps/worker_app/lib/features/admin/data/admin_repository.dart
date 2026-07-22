import 'package:dio/dio.dart';

import '../../../core/auth/jwt_utils.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/session/session_coordinator.dart';
import '../../../core/storage/token_storage.dart';
import '../../../shared/app_strings.dart';
import '../../../shared/models/mobile_models.dart';
import '../../assignments/data/models/assignment.dart';
import '../../attendance/data/models/attendance.dart';
import '../../attendance/data/models/kiosk_session.dart';
import '../../auth/data/models/auth_models.dart';
import '../../notifications/data/models/notification_item.dart';
import 'admin_session_cache.dart';

class AdminRepository {
  AdminRepository({
    required ApiClient apiClient,
    required TokenStorage tokenStorage,
    AdminSessionCache? sessionCache,
  }) : _dio = apiClient.dio,
       _tokenStorage = tokenStorage,
       _sessionCache = sessionCache ?? SecureAdminSessionCache();

  final Dio _dio;
  final TokenStorage _tokenStorage;
  final AdminSessionCache _sessionCache;

  Future<AuthSession> loginAdmin({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/admin/login',
        data: {'email': email, 'password': password},
      );
      final session = AuthSession.fromJson(response.data ?? const {});
      final payload = readAccessTokenPayload(session.accessToken);
      if (!_isAdminRole(session.user.role) ||
          !_isAdminRole(payload?.role) ||
          isAccessTokenExpired(payload)) {
        throw const ApiException(message: AppStrings.wrongRoleForAdmin);
      }
      await _tokenStorage.saveTokens(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      );
      await _sessionCache.save(session.user);
      return session;
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> forgotPassword(String email) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/admin/forgot-password',
        data: {'email': email},
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminWorkerPage> listWorkers({
    String? status,
    bool? available,
    int limit = 50,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/admin/workers',
        queryParameters: {
          'limit': limit,
          'sort': 'desc',
          if (status != null) 'status': status,
          if (available != null) 'available': available,
        },
      );
      return AdminWorkerPage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminWorkerProfile> approveWorker(String id) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/admin/workers/$id/approve',
      );
      return AdminWorkerProfile.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminWorkerProfile> getWorker(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/admin/workers/$id',
      );
      return AdminWorkerProfile.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminWorkerProfile> rejectWorker(String id, String reason) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/admin/workers/$id/reject',
        data: {'reason': reason},
      );
      return AdminWorkerProfile.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminWorkerProfile> updateWorkerClass(
    String id,
    String? workerClass,
  ) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/admin/workers/$id/class',
        data: {'worker_class': workerClass},
      );
      return AdminWorkerProfile.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminCompanyPage> listCompanies({
    String? status,
    int limit = 50,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/admin/companies',
        queryParameters: {
          'limit': limit,
          'sort': 'desc',
          if (status != null) 'status': status,
        },
      );
      return AdminCompanyPage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminCompanyProfile> getCompany(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/admin/companies/$id',
      );
      return AdminCompanyProfile.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminCompanyProfile> approveCompany(String id) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/admin/companies/$id/approve',
      );
      return AdminCompanyProfile.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminCompanyProfile> rejectCompany(String id, String reason) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/admin/companies/$id/reject',
        data: {'reason': reason},
      );
      return AdminCompanyProfile.fromJson(response.data ?? const {});
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

  Future<void> createAssignment({
    required String orderId,
    required String workerId,
    String? category,
    String? orderCategoryItemId,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/assignments',
        data: {
          'order_id': orderId,
          'assignments': [
            {
              'worker_id': workerId,
              if (category != null) 'category': category,
              if (orderCategoryItemId != null)
                'order_category_item_id': orderCategoryItemId,
            },
          ],
        },
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> cancelAssignment(String id) async {
    try {
      await _dio.patch<void>('/assignments/$id/cancel');
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

  Future<AttendancePage> listAttendance({bool openOnly = false}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/attendance',
        queryParameters: {
          'limit': 50,
          'sort': 'desc',
          if (openOnly) 'open_only': true,
        },
      );
      return AttendancePage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AdminReportSummary> getReportSummary({
    String? workerId,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/admin/reports/summary',
        queryParameters: {
          if (workerId != null) 'worker_id': workerId,
          if (startDate != null) 'start_date': _dateOnly(startDate),
          if (endDate != null) 'end_date': _dateOnly(endDate),
        },
      );
      return AdminReportSummary.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  String _dateOnly(DateTime date) {
    final local = date.toLocal();
    return '${local.year.toString().padLeft(4, '0')}-'
        '${local.month.toString().padLeft(2, '0')}-'
        '${local.day.toString().padLeft(2, '0')}';
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
      await _clearStoredSession();
    }
  }

  Future<AuthSession?> ensureValidStoredSession() async {
    final accessToken = await _tokenStorage.readAccessToken();
    final refreshToken = await _tokenStorage.readRefreshToken();
    final payload = readAccessTokenPayload(accessToken);
    if (!_isAdminRole(payload?.role) ||
        refreshToken == null ||
        refreshToken.isEmpty) {
      await _clearStoredSession();
      return null;
    }
    if (!isAccessTokenExpired(payload)) {
      final cachedUser = await _sessionCache.read();
      if (cachedUser != null &&
          _isAdminRole(cachedUser.role) &&
          cachedUser.role == payload?.role) {
        return AuthSession(
          accessToken: accessToken!,
          refreshToken: refreshToken,
          user: cachedUser,
        );
      }
      // Upgrade sessions created before metadata caching was introduced.
      return _refreshStoredSession();
    }
    return _refreshStoredSession();
  }

  Future<AuthSession?> _refreshStoredSession() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      await _clearStoredSession();
      return null;
    }

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
      );
      final session = AuthSession.fromJson(response.data ?? const {});
      final payload = readAccessTokenPayload(session.accessToken);
      if (!_isAdminRole(session.user.role) ||
          !_isAdminRole(payload?.role) ||
          isAccessTokenExpired(payload)) {
        await _clearStoredSession();
        return null;
      }
      await _tokenStorage.saveTokens(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      );
      await _sessionCache.save(session.user);
      return session;
    } catch (error) {
      final apiError = mapDioException(error);
      if (isTerminalSessionErrorCode(apiError.code)) {
        await _clearStoredSession();
        return null;
      }
      throw apiError;
    }
  }

  Future<bool> hasStoredTokens() async =>
      (await _tokenStorage.readTokens()) != null;

  Future<void> clearLocalSession() => _clearStoredSession();

  Future<void> _clearStoredSession() async {
    await Future.wait<void>([_tokenStorage.clear(), _sessionCache.clear()]);
  }

  bool _isAdminRole(String? role) => role == 'super_admin' || role == 'admin';
}
