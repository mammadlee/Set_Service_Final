import '../../../../core/config/kiosk_url_policy.dart';

class KioskSessionResult {
  const KioskSessionResult({
    required this.id,
    required this.assignmentId,
    required this.orderId,
    required this.orderTitle,
    required this.companyName,
    required this.kioskToken,
    required this.kioskUrl,
    required this.refreshIntervalSeconds,
  });

  final String id;
  final String assignmentId;
  final String orderId;
  final String orderTitle;
  final String companyName;
  final String kioskToken;
  final String kioskUrl;
  final int refreshIntervalSeconds;

  factory KioskSessionResult.fromJson(Map<String, dynamic> json) {
    final kioskUrl = json['kiosk_url'] as String? ?? '';
    if (!isSecureKioskUrl(kioskUrl)) {
      throw const FormatException('Kiosk URL must use HTTPS.');
    }

    return KioskSessionResult(
      id: json['id'] as String? ?? '',
      assignmentId: json['assignment_id'] as String? ?? '',
      orderId: json['order_id'] as String? ?? '',
      orderTitle: json['order_title'] as String? ?? '',
      companyName: json['company_name'] as String? ?? '',
      kioskToken: json['kiosk_token'] as String? ?? '',
      kioskUrl: kioskUrl,
      refreshIntervalSeconds: json['refresh_interval_seconds'] as int? ?? 30,
    );
  }

  static bool isSecureKioskUrl(String value) {
    return KioskUrlPolicy.isAllowed(value);
  }
}
