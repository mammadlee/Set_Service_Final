class AdminModerationReportPage {
  const AdminModerationReportPage({
    required this.data,
    required this.page,
    required this.totalPages,
  });

  final List<AdminModerationReport> data;
  final int page;
  final int totalPages;

  factory AdminModerationReportPage.fromJson(Map<String, dynamic> json) {
    final rawData = json['data'];
    final meta = json['meta'];
    final pageMeta = meta is Map<String, dynamic> ? meta : const <String, dynamic>{};
    return AdminModerationReportPage(
      data: rawData is List
          ? rawData
                .whereType<Map<String, dynamic>>()
                .map(AdminModerationReport.fromJson)
                .toList(growable: false)
          : const [],
      page: (pageMeta['page'] as num?)?.toInt() ?? 1,
      totalPages: (pageMeta['total_pages'] as num?)?.toInt() ?? 1,
    );
  }
}

class AdminModerationReport {
  const AdminModerationReport({
    required this.id,
    required this.reporterRole,
    required this.targetType,
    required this.targetId,
    required this.reason,
    required this.status,
    this.details,
    this.resolutionNote,
    this.targetLabel,
    this.reporterName,
    this.createdAt,
    this.reviewedAt,
  });

  final String id;
  final String reporterRole;
  final String targetType;
  final String targetId;
  final String reason;
  final String status;
  final String? details;
  final String? resolutionNote;
  final String? targetLabel;
  final String? reporterName;
  final DateTime? createdAt;
  final DateTime? reviewedAt;

  factory AdminModerationReport.fromJson(Map<String, dynamic> json) {
    final target = json['target'];
    final reporter = json['reporter'];
    final targetMap = target is Map<String, dynamic>
        ? target
        : const <String, dynamic>{};
    final reporterMap = reporter is Map<String, dynamic>
        ? reporter
        : const <String, dynamic>{};
    return AdminModerationReport(
      id: json['id']?.toString() ?? '',
      reporterRole: json['reporter_role']?.toString() ?? '',
      targetType: json['target_type']?.toString() ?? '',
      targetId: json['target_id']?.toString() ?? '',
      reason: json['reason']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      details: json['details']?.toString(),
      resolutionNote: json['resolution_note']?.toString(),
      targetLabel: targetMap['label']?.toString(),
      reporterName: reporterMap['name']?.toString(),
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? ''),
      reviewedAt: DateTime.tryParse(json['reviewed_at']?.toString() ?? ''),
    );
  }
}
