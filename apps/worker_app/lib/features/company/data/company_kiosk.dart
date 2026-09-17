class CompanyVenueKiosk {
  const CompanyVenueKiosk({
    required this.id,
    required this.name,
    required this.status,
    required this.orderId,
    required this.kioskUrl,
  });

  final String id;
  final String name;
  final String status;
  final String? orderId;
  final String? kioskUrl;

  factory CompanyVenueKiosk.fromJson(Map<String, dynamic> json) {
    final session = json['active_session'] as Map<String, dynamic>?;
    return CompanyVenueKiosk(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      status: json['status'] as String? ?? '',
      orderId: session?['order_id'] as String?,
      kioskUrl: json['kiosk_url'] as String?,
    );
  }
}

class CompanyOrderQrState {
  const CompanyOrderQrState({required this.eligible, required this.kiosks});

  /// Eligibility is returned by the backend; do not infer it from assignments.
  final bool eligible;
  final List<CompanyVenueKiosk> kiosks;
}
