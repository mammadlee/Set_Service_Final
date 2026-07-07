import 'package:dio/dio.dart';

import '../../shared/app_strings.dart';
import '../auth/jwt_utils.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient({
    required String baseUrl,
    required TokenStorage tokenStorage,
    required String expectedRole,
  }) : _tokenStorage = tokenStorage,
       _expectedRole = expectedRole,
       dio = Dio(
         BaseOptions(
           baseUrl: baseUrl,
           connectTimeout: const Duration(seconds: 20),
           receiveTimeout: const Duration(seconds: 30),
           sendTimeout: const Duration(seconds: 30),
           headers: const {
             'accept': 'application/json',
             'content-type': 'application/json',
           },
         ),
       ),
       _refreshDio = Dio(
         BaseOptions(
           baseUrl: baseUrl,
           connectTimeout: const Duration(seconds: 20),
           receiveTimeout: const Duration(seconds: 30),
           sendTimeout: const Duration(seconds: 30),
           headers: const {
             'accept': 'application/json',
             'content-type': 'application/json',
           },
         ),
       ) {
    dio.interceptors.add(
      QueuedInterceptorsWrapper(onRequest: _onRequest, onError: _onError),
    );
  }

  final Dio dio;
  final Dio _refreshDio;
  final TokenStorage _tokenStorage;
  final String _expectedRole;

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (_isPublicAuthEndpoint(options.path)) {
      handler.next(options);
      return;
    }

    if (!_tokenStorage.isLoaded) {
      await _tokenStorage.warmUp();
    }
    final token = _tokenStorage.cachedAccessToken;
    if (token != null && token.isNotEmpty) {
      options.headers['authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  Future<void> _onError(
    DioException error,
    ErrorInterceptorHandler handler,
  ) async {
    final status = error.response?.statusCode;
    final alreadyRetried = error.requestOptions.extra['retried'] == true;
    final skipRefresh = error.requestOptions.extra['skipAuthRefresh'] == true;

    if (status != 401 ||
        alreadyRetried ||
        skipRefresh ||
        _isPublicAuthEndpoint(error.requestOptions.path)) {
      handler.next(error);
      return;
    }

    final refreshed = await _tryRefreshTokens();
    if (!refreshed) {
      await _tokenStorage.clear();
      handler.next(error);
      return;
    }

    final accessToken = _tokenStorage.cachedAccessToken;
    final request = error.requestOptions;
    request.extra['retried'] = true;
    if (accessToken != null) {
      request.headers['authorization'] = 'Bearer $accessToken';
    }

    try {
      final response = await dio.fetch<dynamic>(request);
      handler.resolve(response);
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  Future<bool> _tryRefreshTokens() async {
    if (!_tokenStorage.isLoaded) {
      await _tokenStorage.warmUp();
    }
    final refreshToken = _tokenStorage.cachedRefreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return false;

    try {
      final response = await _refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
      );
      final data = response.data;
      final access = data?['access_token'];
      final refresh = data?['refresh_token'];
      if (access is! String || refresh is! String) return false;
      final payload = readAccessTokenPayload(access);
      if (!_roleMatchesExpected(payload?.role) ||
          isAccessTokenExpired(payload)) {
        await _tokenStorage.clear();
        return false;
      }
      await _tokenStorage.saveTokens(
        accessToken: access,
        refreshToken: refresh,
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  bool _isPublicAuthEndpoint(String path) {
    return switch (path) {
      '/auth/worker/register' ||
      '/auth/worker/login' ||
      '/auth/worker/request-otp' ||
      '/auth/worker/complete-registration' ||
      '/auth/worker/forgot-password' ||
      '/auth/worker/reset-password' ||
      '/auth/company/register' ||
      '/auth/company/complete-registration' ||
      '/auth/company/login' ||
      '/auth/company/forgot-password' ||
      '/auth/company/reset-password' ||
      '/auth/admin/login' ||
      '/auth/admin/forgot-password' ||
      '/auth/verify-otp' ||
      '/auth/refresh' => true,
      _ => false,
    };
  }

  bool _roleMatchesExpected(String? role) {
    if (_expectedRole == 'super_admin') {
      return role == 'super_admin' || role == 'admin';
    }
    return role == _expectedRole;
  }
}

ApiException mapDioException(Object error) {
  if (error is DioException) {
    final response = error.response;
    final data = response?.data;

    if (data is Map<String, dynamic>) {
      final code = data['code'] is String ? data['code'] as String : null;
      final fallback = data['error'] is String ? data['error'] as String : null;
      var message = AppStrings.backendError(code: code, fallback: fallback);
      if (code == null && response?.statusCode == 429) {
        message = AppStrings.tooManyRequests;
      } else if (code == null &&
          response?.statusCode != null &&
          response!.statusCode! >= 500) {
        message = AppStrings.internalServerError;
      }
      return ApiException(
        message: message,
        code: code,
        statusCode: response?.statusCode,
        details: data['details'],
      );
    }

    return ApiException(
      message: error.type == DioExceptionType.connectionError
          ? AppStrings.networkError
          : AppStrings.unknownError,
      statusCode: response?.statusCode,
      details: data,
    );
  }

  if (error is ApiException) return error;
  return const ApiException(message: AppStrings.unknownError);
}
