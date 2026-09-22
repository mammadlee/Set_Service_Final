import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import 'models/assignment.dart';

class AssignmentRepository {
  AssignmentRepository({required ApiClient apiClient}) : _dio = apiClient.dio;

  final Dio _dio;

  Future<AssignmentPage> listAssignments({String? status}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/assignments',
        queryParameters: {
          'limit': 50,
          'sort': 'desc',
          if (status != null) 'status': status,
        },
      );
      return AssignmentPage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<Assignment> getAssignment(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/assignments/$id');
      return Assignment.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<Assignment> acceptAssignment(String id) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/assignments/$id/accept',
      );
      return Assignment.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> reportOrder({
    required String orderId,
    required String reason,
    String? details,
  }) => _reportContent(
    targetType: 'order',
    targetId: orderId,
    reason: reason,
    details: details,
  );

  Future<void> reportCompany({
    required String companyId,
    required String reason,
    String? details,
  }) => _reportContent(
    targetType: 'company_profile',
    targetId: companyId,
    reason: reason,
    details: details,
  );

  Future<void> _reportContent({
    required String targetType,
    required String targetId,
    required String reason,
    String? details,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/moderation/reports',
        data: {
          'target_type': targetType,
          'target_id': targetId,
          'reason': reason,
          if (details != null && details.trim().isNotEmpty)
            'details': details.trim(),
        },
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<Assignment> rejectAssignment(String id) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/assignments/$id/reject',
      );
      return Assignment.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }
}
