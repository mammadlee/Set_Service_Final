import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../shared/app_strings.dart';
import '../../auth/data/models/auth_models.dart';

class WorkerRepository {
  WorkerRepository({required ApiClient apiClient}) : _dio = apiClient.dio;

  static const maxUploadBytes = 5 * 1024 * 1024;
  static const _imageExtensions = {'jpg', 'jpeg', 'png', 'webp'};
  static const _documentExtensions = {..._imageExtensions, 'pdf'};

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

  Future<WorkerMe> uploadProfilePhoto({
    required String fileName,
    String? path,
    Uint8List? bytes,
    int? fileSize,
    ProgressCallback? onSendProgress,
    CancelToken? cancelToken,
  }) async {
    return _uploadFile(
      '/workers/me/profile-photo',
      fileName: fileName,
      path: path,
      bytes: bytes,
      fileSize: fileSize,
      allowedExtensions: _imageExtensions,
      onSendProgress: onSendProgress,
      cancelToken: cancelToken,
    );
  }

  Future<WorkerMe> uploadDocument({
    required String type,
    required String fileName,
    String? path,
    Uint8List? bytes,
    int? fileSize,
    ProgressCallback? onSendProgress,
    CancelToken? cancelToken,
  }) async {
    return _uploadFile(
      '/workers/me/documents',
      fileName: fileName,
      path: path,
      bytes: bytes,
      fileSize: fileSize,
      allowedExtensions: _documentExtensions,
      type: type,
      onSendProgress: onSendProgress,
      cancelToken: cancelToken,
    );
  }

  Future<WorkerMe> _uploadFile(
    String endpoint, {
    required String fileName,
    String? path,
    Uint8List? bytes,
    int? fileSize,
    required Set<String> allowedExtensions,
    String? type,
    ProgressCallback? onSendProgress,
    CancelToken? cancelToken,
  }) async {
    try {
      if ((path == null || path.isEmpty) && bytes == null) {
        throw const ApiException(
          message: AppStrings.pickFileCancelled,
          code: 'UPLOAD_FILE_REQUIRED',
        );
      }
      final extension = _extensionOf(fileName);
      if (!allowedExtensions.contains(extension)) {
        throw const ApiException(
          message: AppStrings.unsupportedFileFormat,
          code: 'UPLOAD_MIME_NOT_ALLOWED',
        );
      }
      final declaredSize = bytes?.length ?? fileSize;
      if (declaredSize != null && declaredSize > maxUploadBytes) {
        throw const ApiException(
          message: AppStrings.uploadFileTooLarge,
          code: 'UPLOAD_FILE_TOO_LARGE',
        );
      }
      final filePart = bytes != null
          ? MultipartFile.fromBytes(
              bytes,
              filename: fileName,
              contentType: _mediaTypeForFile(fileName),
            )
          : await MultipartFile.fromFile(
              path!,
              filename: fileName,
              contentType: _mediaTypeForFile(fileName),
            );
      if (filePart.length > maxUploadBytes) {
        throw const ApiException(
          message: AppStrings.uploadFileTooLarge,
          code: 'UPLOAD_FILE_TOO_LARGE',
        );
      }
      final formData = FormData.fromMap({
        if (type != null) 'type': type,
        'file': filePart,
      });
      final response = await _dio.post<Map<String, dynamic>>(
        endpoint,
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
          sendTimeout: const Duration(seconds: 60),
          receiveTimeout: const Duration(seconds: 60),
        ),
        onSendProgress: onSendProgress,
        cancelToken: cancelToken,
      );
      return WorkerMe.fromJson(response.data ?? const {});
    } catch (error) {
      if (error is DioException && error.type == DioExceptionType.cancel) {
        throw const ApiException(
          message: AppStrings.uploadCancelled,
          code: 'UPLOAD_CANCELLED',
        );
      }
      throw mapDioException(error);
    }
  }

  String _extensionOf(String fileName) {
    final separator = fileName.lastIndexOf('.');
    if (separator <= 0 || separator == fileName.length - 1) return '';
    return fileName.substring(separator + 1).toLowerCase();
  }

  MediaType _mediaTypeForFile(String fileName) {
    final extension = _extensionOf(fileName);
    return switch (extension) {
      'jpg' || 'jpeg' => MediaType('image', 'jpeg'),
      'png' => MediaType('image', 'png'),
      'webp' => MediaType('image', 'webp'),
      'pdf' => MediaType('application', 'pdf'),
      _ => MediaType('application', 'octet-stream'),
    };
  }
}
