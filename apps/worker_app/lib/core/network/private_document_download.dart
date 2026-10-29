import 'package:dio/dio.dart';

import 'api_client.dart';
import 'api_exception.dart';

/// Obtain a new, authorized short-lived URL for every open action. Profile
/// metadata URLs are deliberately never used as download destinations.
Future<Uri> requestPrivateDocumentDownload(
  Dio dio, {
  required String path,
  Options? options,
}) async {
  try {
    final requestOptions = (options ?? Options()).copyWith(
      headers: {
        ...?options?.headers,
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
    );
    for (var attempt = 0; attempt < 2; attempt++) {
      final response = await dio.get<Map<String, dynamic>>(
        path,
        options: requestOptions,
      );
      final expiry = response.data?['expires_at'];
      final expiresAt = expiry is String ? DateTime.tryParse(expiry) : null;
      if (expiresAt != null && !expiresAt.isAfter(DateTime.now().toUtc())) {
        if (attempt == 0) continue;
        throw const ApiException(
          message: 'Sənəd keçidinin vaxtı bitib. Yenidən açmağa cəhd edin.',
          code: 'WORKER_DOCUMENT_URL_EXPIRED',
        );
      }
      final value = response.data?['url'];
      final uri = resolvePrivateDocumentDownloadUrl(
        value is String ? value : null,
        apiBaseUrl: dio.options.baseUrl,
      );
      if (uri == null) {
        throw const ApiException(
          message: 'Sənəd üçün təhlükəsiz keçid alınmadı. Yenidən cəhd edin.',
          code: 'WORKER_DOCUMENT_URL_INVALID',
        );
      }
      return uri;
    }
    throw StateError('Document URL attempts exhausted');
  } catch (error) {
    throw mapDioException(error);
  }
}

Uri? resolvePrivateDocumentDownloadUrl(
  String? value, {
  required String apiBaseUrl,
}) {
  if (value == null || RegExp(r'[\x00-\x1f\x7f\\]').hasMatch(value)) {
    return null;
  }
  final rawValue = value.trim();
  if (rawValue.isEmpty) return null;
  final parsed = Uri.tryParse(rawValue);
  final base = Uri.tryParse(apiBaseUrl.trim());
  if (parsed == null || (!parsed.isAbsolute && parsed.hasAuthority)) {
    return null;
  }
  Uri resolved = parsed;
  if (!parsed.isAbsolute) {
    if (base == null || !base.isAbsolute || base.host.isEmpty) return null;
    resolved = base
        .replace(path: base.path.endsWith('/') ? base.path : '${base.path}/')
        .resolveUri(parsed);
  }
  if (resolved.host.isEmpty ||
      resolved.userInfo.isNotEmpty ||
      resolved.hasFragment) {
    return null;
  }
  if (resolved.scheme == 'https') return resolved;
  const loopbackHosts = {'localhost', '127.0.0.1', '::1'};
  if (resolved.scheme == 'http' &&
      base?.scheme == 'http' &&
      loopbackHosts.contains(resolved.host) &&
      resolved.host == base?.host &&
      resolved.port == base?.port) {
    return resolved;
  }
  return null;
}
