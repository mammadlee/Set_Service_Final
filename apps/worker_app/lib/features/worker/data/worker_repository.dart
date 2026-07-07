import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import '../../../core/network/api_client.dart';
import '../../auth/data/models/auth_models.dart';

class WorkerRepository {
  WorkerRepository({required ApiClient apiClient}) : _dio = apiClient.dio;

  final Dio _dio;

  Future<WorkerMe> getMe() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/workers/me');
      return WorkerMe.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<WorkerMe> updateProfile({
    required String? email,
    required List<String> positionIds,
    required List<String> skills,
    required List<String> languages,
    required String workHistorySummary,
    required List<WorkerExperience> workHistory,
    required String? gender,
    required bool whatsappAvailable,
  }) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/workers/me',
        data: {
          'email': email?.trim().isEmpty == true ? null : email?.trim(),
          if (positionIds.isNotEmpty) 'position_ids': positionIds,
          'skills': skills,
          'languages': languages,
          'work_history_summary': workHistorySummary.trim().isEmpty
              ? null
              : workHistorySummary.trim(),
          'work_history': workHistory.map((item) => item.toJson()).toList(),
          'gender': gender,
          'whatsapp_available': whatsappAvailable,
        },
      );
      return WorkerMe.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> requestPhoneChange(String phone) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/worker/phone-change/request',
        data: {'phone': phone},
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> confirmPhoneChange({
    required String phone,
    required String otpCode,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/worker/phone-change/confirm',
        data: {'phone': phone, 'otp_code': otpCode},
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> requestEmailVerification(String email) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/email-verification/request',
        data: {'email': email.trim()},
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<void> confirmEmailVerification(String otpCode) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/auth/email-verification/confirm',
        data: {'otp_code': otpCode.trim()},
      );
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<WorkerMe> uploadProfilePhoto(String path, String fileName) async {
    return _uploadFile('/workers/me/profile-photo', path, fileName);
  }

  Future<WorkerMe> uploadDocument({
    required String type,
    required String path,
    required String fileName,
  }) async {
    return _uploadFile('/workers/me/documents', path, fileName, type: type);
  }

  Future<WorkerMe> _uploadFile(
    String endpoint,
    String path,
    String fileName, {
    String? type,
  }) async {
    try {
      final formData = FormData.fromMap({
        if (type != null) 'type': type,
        'file': await MultipartFile.fromFile(
          path,
          filename: fileName,
          contentType: _mediaTypeForFile(fileName),
        ),
      });
      final response = await _dio.post<Map<String, dynamic>>(
        endpoint,
        data: formData,
        options: Options(contentType: 'multipart/form-data'),
      );
      return WorkerMe.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  MediaType _mediaTypeForFile(String fileName) {
    final extension = fileName.split('.').last.toLowerCase();
    return switch (extension) {
      'jpg' || 'jpeg' => MediaType('image', 'jpeg'),
      'png' => MediaType('image', 'png'),
      'webp' => MediaType('image', 'webp'),
      'pdf' => MediaType('application', 'pdf'),
      _ => MediaType('application', 'octet-stream'),
    };
  }
}
