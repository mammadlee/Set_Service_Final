import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import 'models/attendance.dart';

class AttendanceRepository {
  AttendanceRepository({required ApiClient apiClient}) : _dio = apiClient.dio;

  final Dio _dio;

  Future<AttendancePage> listForAssignment(String assignmentId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/attendance',
        queryParameters: {
          'assignment_id': assignmentId,
          'limit': 20,
          'sort': 'desc',
        },
      );
      return AttendancePage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AttendancePage> listOpen({String? assignmentId}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/attendance',
        queryParameters: {
          if (assignmentId != null && assignmentId.trim().isNotEmpty)
            'assignment_id': assignmentId.trim(),
          'open_only': true,
          'limit': 5,
          'sort': 'desc',
        },
      );
      return AttendancePage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AttendanceLog> checkIn({
    String? assignmentId,
    required String qrToken,
    String? notes,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/attendance/check-in',
        data: {
          if (assignmentId != null && assignmentId.trim().isNotEmpty)
            'assignment_id': assignmentId.trim(),
          'qr_token': qrToken,
          if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
        },
      );
      return AttendanceLog.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<AttendanceLog> checkOut({
    String? assignmentId,
    required String qrToken,
    String? notes,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/attendance/check-out',
        data: {
          if (assignmentId != null && assignmentId.trim().isNotEmpty)
            'assignment_id': assignmentId.trim(),
          'qr_token': qrToken,
          if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
        },
      );
      return AttendanceLog.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }
}
