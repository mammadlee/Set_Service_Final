import '../router/app_routes.dart';
import '../session/app_role.dart';

class PushDeepLink {
  const PushDeepLink(this.routeName, {this.argument});

  final String routeName;
  final Object? argument;
}

/// Resolves untrusted push data into a role-scoped in-app destination.
///
/// A payload that explicitly names a different role is ignored. Payloads from
/// older backend events may omit the role; those are safely constrained to the
/// role that is already active on the device.
PushDeepLink? resolvePushDeepLink(
  Map<String, dynamic> data,
  AppRole activeRole,
) {
  final rawPayloadRole =
      _nonEmptyString(data['role']) ??
      _nonEmptyString(data['app_role']) ??
      _nonEmptyString(data['recipient_role']);
  if (rawPayloadRole != null) {
    final payloadRole = _parseRole(rawPayloadRole);
    if (payloadRole == null || payloadRole != activeRole) return null;
  }

  final assignmentId = _uuidString(data['assignment_id']);
  final orderId = _uuidString(data['order_id']);

  return switch (activeRole) {
    AppRole.worker =>
      assignmentId == null
          ? const PushDeepLink(AppRoutes.workerNotifications)
          : PushDeepLink(AppRoutes.assignmentDetail, argument: assignmentId),
    AppRole.company =>
      orderId == null
          ? const PushDeepLink(AppRoutes.companyNotifications)
          : PushDeepLink(AppRoutes.companyOrderDetail, argument: orderId),
    AppRole.admin =>
      orderId == null
          ? const PushDeepLink(AppRoutes.adminNotifications)
          : PushDeepLink(AppRoutes.adminOrderDetail, argument: orderId),
  };
}

AppRole? _parseRole(String raw) {
  return switch (raw.toLowerCase()) {
    'worker' => AppRole.worker,
    'company' => AppRole.company,
    'admin' || 'super_admin' => AppRole.admin,
    _ => null,
  };
}

String? _nonEmptyString(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

final _canonicalUuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

String? _uuidString(Object? value) {
  final normalized = _nonEmptyString(value);
  if (normalized == null || !_canonicalUuid.hasMatch(normalized)) return null;
  return normalized;
}
