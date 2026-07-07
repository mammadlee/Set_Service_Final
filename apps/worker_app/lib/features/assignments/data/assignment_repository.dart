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
