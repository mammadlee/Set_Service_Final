import 'package:dio/dio.dart';

import '../../shared/app_strings.dart';
import '../auth/jwt_utils.dart';
import '../session/session_coordinator.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient({
    required String baseUrl,
    required TokenStorage tokenStorage,
    required String expectedRole,
    required SessionCoordinator sessionCoordinator,
    Dio? dioOverride,
    Dio? refreshDioOverride,
  }) : _tokenStorage = tokenStorage,
       _expectedRole = expectedRole,
       _sessionCoordinator = sessionCoordinator,
       dio = dioOverride ?? Dio(_baseOptions(baseUrl)),
       _refreshDio = refreshDioOverride ?? Dio(_baseOptions(baseUrl)) {
    dio.interceptors.add(
      QueuedInterceptorsWrapper(onRequest: _onRequest, onError: _onError),
    );
  }

  final Dio dio;
  final Dio _refreshDio;
  final TokenStorage _tokenStorage;
  final String _expectedRole;
  final SessionCoordinator _sessionCoordinator;
  Future<_RefreshOutcome>? _refreshInFlight;

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
    var token = _tokenStorage.cachedAccessToken;
    final payload = readAccessTokenPayload(token);
    if (isAccessTokenExpired(payload)) {
      options.extra['refreshAttempted'] = true;
      final outcome = await _refreshTokensSingleFlight();
      if (outcome == _RefreshOutcome.refreshed) {
        token = _tokenStorage.cachedAccessToken;
      }
    } else if (token != null && token.isNotEmpty) {
      _sessionCoordinator.notifyState(
        sessionKey: _expectedRole,
        state: SessionState.authenticated,
      );
    }
    if (token != null && token.isNotEmpty) {
      options.headers['authorization'] = 'Bearer $token';
      options.extra['accessTokenUsed'] = token;
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
    final responseCode = _responseCode(error.response?.data);
    final isPublicEndpoint = _isPublicAuthEndpoint(error.requestOptions.path);

    if (!isPublicEndpoint && isTerminalSessionErrorCode(responseCode)) {
      await _invalidateSession(responseCode!);
      handler.next(error);
      return;
    }

    if (_isNetworkFailure(error) &&
        _tokenStorage.cachedRefreshToken?.isNotEmpty == true) {
      _sessionCoordinator.notifyState(
        sessionKey: _expectedRole,
        state: SessionState.offlineAuthenticated,
      );
    }

    if (status != 401 || alreadyRetried || skipRefresh || isPublicEndpoint) {
      handler.next(error);
      return;
    }

    final currentAccessToken = _tokenStorage.cachedAccessToken;
    final accessTokenUsed =
        error.requestOptions.extra['accessTokenUsed'] as String?;
    final tokenWasRotated =
        currentAccessToken != null &&
        currentAccessToken.isNotEmpty &&
        accessTokenUsed != null &&
        currentAccessToken != accessTokenUsed;
    if (!tokenWasRotated &&
        error.requestOptions.extra['refreshAttempted'] == true) {
      // A proactive refresh already failed for this request. Do not create a
      // refresh -> protected request -> refresh loop on transient failures.
      handler.next(error);
      return;
    }
    final refreshOutcome = tokenWasRotated
        ? _RefreshOutcome.refreshed
        : await _refreshTokensSingleFlight();
    if (refreshOutcome != _RefreshOutcome.refreshed) {
      handler.next(error);
      return;
    }

    final accessToken = _tokenStorage.cachedAccessToken;
    final request = error.requestOptions;
    request.extra['retried'] = true;
    final requestData = request.data;
    if (requestData is FormData) {
      // Dio multipart streams are single-use. clone() rebuilds each
      // MultipartFile stream before replaying the request after refresh.
      request.data = requestData.clone();
    } else if (!_isReplaySafe(requestData)) {
      // Refresh succeeded, but an arbitrary stream cannot be safely replayed.
      // Keep the new tokens and let the caller explicitly retry the action.
      handler.next(error);
      return;
    }
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

  Future<_RefreshOutcome> _refreshTokensSingleFlight() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;

    late final Future<_RefreshOutcome> refreshFuture;
    refreshFuture = _performRefresh().whenComplete(() {
      if (identical(_refreshInFlight, refreshFuture)) {
        _refreshInFlight = null;
      }
    });
    _refreshInFlight = refreshFuture;
    return refreshFuture;
  }

  Future<_RefreshOutcome> _performRefresh() async {
    if (!_tokenStorage.isLoaded) {
      await _tokenStorage.warmUp();
    }
    final refreshToken = _tokenStorage.cachedRefreshToken;
    if (refreshToken == null || refreshToken.isEmpty) {
      await _invalidateSession('INVALID_REFRESH_TOKEN');
      return _RefreshOutcome.invalidSession;
    }

    _sessionCoordinator.notifyState(
      sessionKey: _expectedRole,
      state: SessionState.refreshing,
    );
    try {
      final response = await _refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
      );
      final data = response.data;
      final access = data?['access_token'];
      final refresh = data?['refresh_token'];
      if (access is! String || refresh is! String) {
        await _invalidateSession('INVALID_REFRESH_TOKEN');
        return _RefreshOutcome.invalidSession;
      }
      final payload = readAccessTokenPayload(access);
      if (!_roleMatchesExpected(payload?.role) ||
          isAccessTokenExpired(payload)) {
        await _invalidateSession('INVALID_REFRESH_TOKEN');
        return _RefreshOutcome.invalidSession;
      }
      await _tokenStorage.saveTokens(
        accessToken: access,
        refreshToken: refresh,
      );
      _sessionCoordinator.notifyState(
        sessionKey: _expectedRole,
        state: SessionState.authenticated,
      );
      return _RefreshOutcome.refreshed;
    } on DioException catch (error) {
      final code = _responseCode(error.response?.data);
      if (isTerminalSessionErrorCode(code)) {
        await _invalidateSession(code!);
        return _RefreshOutcome.invalidSession;
      }
      _sessionCoordinator.notifyState(
        sessionKey: _expectedRole,
        state: SessionState.offlineAuthenticated,
      );
      return _RefreshOutcome.transientFailure;
    } catch (_) {
      _sessionCoordinator.notifyState(
        sessionKey: _expectedRole,
        state: SessionState.offlineAuthenticated,
      );
      return _RefreshOutcome.transientFailure;
    }
  }

  Future<void> _invalidateSession(String code) async {
    await _tokenStorage.clear();
    _sessionCoordinator.notifyInvalidated(
      sessionKey: _expectedRole,
      code: code,
    );
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

  bool _isReplaySafe(Object? data) {
    return data == null ||
        data is Map ||
        data is List ||
        data is String ||
        data is num ||
        data is bool;
  }

  String? _responseCode(Object? data) {
    if (data is Map<String, dynamic> && data['code'] is String) {
      return data['code'] as String;
    }
    if (data is Map && data['code'] is String) {
      return data['code'] as String;
    }
    return null;
  }

  bool _isNetworkFailure(DioException error) {
    return switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.connectionError => true,
      _ => false,
    };
  }
}

enum _RefreshOutcome { refreshed, invalidSession, transientFailure }

BaseOptions _baseOptions(String baseUrl) {
  return BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(seconds: 30),
    sendTimeout: const Duration(seconds: 30),
    headers: const {
      'accept': 'application/json',
      'content-type': 'application/json',
    },
  );
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

    final isNetworkFailure = switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout ||
      DioExceptionType.connectionError => true,
      _ => false,
    };
    return ApiException(
      message: isNetworkFailure
          ? AppStrings.networkError
          : AppStrings.unknownError,
      code: isNetworkFailure ? 'NETWORK_ERROR' : null,
      statusCode: response?.statusCode,
      details: data,
    );
  }

  if (error is ApiException) return error;
  return const ApiException(message: AppStrings.unknownError);
}
