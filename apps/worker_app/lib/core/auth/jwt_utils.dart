import 'dart:convert';

class AccessTokenPayload {
  const AccessTokenPayload({this.role, this.exp});

  final String? role;
  final int? exp;
}

AccessTokenPayload? readAccessTokenPayload(String? token) {
  if (token == null || token.isEmpty) return null;

  final parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    final payloadJson = utf8.decode(
      base64Url.decode(base64Url.normalize(parts[1])),
    );
    final payload = jsonDecode(payloadJson);
    if (payload is! Map<String, dynamic>) return null;
    return AccessTokenPayload(
      role: payload['role'] is String ? payload['role'] as String : null,
      exp: payload['exp'] is int ? payload['exp'] as int : null,
    );
  } catch (_) {
    return null;
  }
}

bool isAccessTokenExpired(AccessTokenPayload? payload) {
  final exp = payload?.exp;
  if (exp == null) return true;
  return exp <= DateTime.now().millisecondsSinceEpoch ~/ 1000;
}
