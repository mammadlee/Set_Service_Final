class PageMeta {
  const PageMeta({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  final int page;
  final int limit;
  final int total;
  final int totalPages;

  factory PageMeta.fromJson(Map<String, dynamic> json) {
    return PageMeta(
      page: _int(json['page'], 1),
      limit: _int(json['limit'], 20),
      total: _int(json['total'], 0),
      totalPages: _int(json['total_pages'], 0),
    );
  }
}

class MobileOrderPage {
  const MobileOrderPage({required this.data, required this.meta});

  final List<MobileOrder> data;
  final PageMeta meta;

  factory MobileOrderPage.fromJson(Map<String, dynamic> json) {
    return MobileOrderPage(
      data: _list(json['data']).map(MobileOrder.fromJson).toList(),
      meta: PageMeta.fromJson(
        json['meta'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class MobileOrder {
  const MobileOrder({
    required this.id,
    required this.title,
    required this.description,
    required this.category,
    required this.status,
    required this.requiredCount,
    required this.assignmentCount,
    required this.categoryItems,
    required this.startDatetime,
    required this.endDatetime,
    required this.location,
    required this.companyName,
    this.payRate,
    this.assignments = const [],
  });

  final String id;
  final String title;
  final String description;
  final String category;
  final String status;
  final int requiredCount;
  final int assignmentCount;
  final List<MobileOrderCategoryItem> categoryItems;
  final DateTime? startDatetime;
  final DateTime? endDatetime;
  final String location;
  final String companyName;
  final num? payRate;
  final List<OrderAssignmentSummary> assignments;

  factory MobileOrder.fromJson(Map<String, dynamic> json) {
    final company = json['company'] as Map<String, dynamic>?;
    return MobileOrder(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      category: json['category'] as String? ?? '',
      status: json['status'] as String? ?? '',
      requiredCount: _int(json['required_count'], 0),
      assignmentCount: _int(json['assignment_count'], 0),
      categoryItems: _list(
        json['category_items'],
      ).map(MobileOrderCategoryItem.fromJson).toList(),
      startDatetime: _date(json['start_datetime']),
      endDatetime: _date(json['end_datetime']),
      location: json['location'] as String? ?? '',
      companyName: company?['name'] as String? ?? '',
      payRate: json['pay_rate'] is num ? json['pay_rate'] as num : null,
      assignments: _list(
        json['assignments'],
      ).map(OrderAssignmentSummary.fromJson).toList(),
    );
  }
}

class MobileOrderCategoryItem {
  const MobileOrderCategoryItem({
    required this.id,
    required this.category,
    required this.requiredCount,
    required this.assignedCount,
    required this.remainingCount,
    required this.notes,
  });

  final String? id;
  final String category;
  final int requiredCount;
  final int assignedCount;
  final int remainingCount;
  final String? notes;

  factory MobileOrderCategoryItem.fromJson(Map<String, dynamic> json) {
    return MobileOrderCategoryItem(
      id: json['id'] as String?,
      category: json['category'] as String? ?? '',
      requiredCount: _int(json['required_count'], 0),
      assignedCount: _int(json['assigned_count'], 0),
      remainingCount: _int(json['remaining_count'], 0),
      notes: json['notes'] as String?,
    );
  }
}

class OrderAssignmentSummary {
  const OrderAssignmentSummary({
    required this.id,
    required this.workerId,
    required this.status,
  });

  final String id;
  final String workerId;
  final String status;

  factory OrderAssignmentSummary.fromJson(Map<String, dynamic> json) {
    return OrderAssignmentSummary(
      id: json['id'] as String? ?? '',
      workerId: json['worker_id'] as String? ?? '',
      status: json['status'] as String? ?? '',
    );
  }
}

class MobileCompanyProfile {
  const MobileCompanyProfile({
    required this.id,
    required this.name,
    required this.phone,
    required this.status,
  });

  final String id;
  final String name;
  final String phone;
  final String status;

  factory MobileCompanyProfile.fromJson(Map<String, dynamic> json) {
    return MobileCompanyProfile(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      status: json['status'] as String? ?? '',
    );
  }
}

class AdminWorkerPage {
  const AdminWorkerPage({required this.data, required this.meta});

  final List<AdminWorkerProfile> data;
  final PageMeta meta;

  factory AdminWorkerPage.fromJson(Map<String, dynamic> json) {
    return AdminWorkerPage(
      data: _list(json['data']).map(AdminWorkerProfile.fromJson).toList(),
      meta: PageMeta.fromJson(
        json['meta'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class AdminWorkerProfile {
  const AdminWorkerProfile({
    required this.id,
    required this.name,
    required this.phone,
    required this.status,
    required this.position,
    required this.availability,
    required this.workerClass,
    required this.ratingAverage,
    required this.ratingCount,
    required this.isFocTraining,
  });

  final String id;
  final String name;
  final String phone;
  final String status;
  final String position;
  final bool availability;
  final String? workerClass;
  final double ratingAverage;
  final int ratingCount;
  final bool isFocTraining;

  factory AdminWorkerProfile.fromJson(Map<String, dynamic> json) {
    return AdminWorkerProfile(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      status: json['status'] as String? ?? '',
      position: json['position'] as String? ?? '',
      availability: json['availability'] == true,
      workerClass: json['worker_class'] as String?,
      ratingAverage: _double(json['rating_avg']),
      ratingCount: _int(json['rating_count'], 0),
      isFocTraining: json['is_foc_training'] == true,
    );
  }
}

class AdminCompanyPage {
  const AdminCompanyPage({required this.data, required this.meta});

  final List<AdminCompanyProfile> data;
  final PageMeta meta;

  factory AdminCompanyPage.fromJson(Map<String, dynamic> json) {
    return AdminCompanyPage(
      data: _list(json['data']).map(AdminCompanyProfile.fromJson).toList(),
      meta: PageMeta.fromJson(
        json['meta'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class AdminCompanyProfile {
  const AdminCompanyProfile({
    required this.id,
    required this.name,
    required this.phone,
    required this.status,
    required this.contactName,
  });

  final String id;
  final String name;
  final String phone;
  final String status;
  final String contactName;

  factory AdminCompanyProfile.fromJson(Map<String, dynamic> json) {
    return AdminCompanyProfile(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      status: json['status'] as String? ?? '',
      contactName: json['contact_name'] as String? ?? '',
    );
  }
}

class CompanyVisibleWorkerProfile {
  const CompanyVisibleWorkerProfile({
    required this.id,
    required this.name,
    required this.position,
    required this.profilePhotoUrl,
    required this.skills,
    required this.languages,
    required this.documents,
    required this.workHistorySummary,
    required this.workHistory,
    required this.ratingAverage,
    required this.ratingCount,
  });

  final String id;
  final String name;
  final String position;
  final String? profilePhotoUrl;
  final List<String> skills;
  final List<String> languages;
  final List<CompanyVisibleWorkerDocument> documents;
  final String? workHistorySummary;
  final List<WorkerExperienceSummary> workHistory;
  final double ratingAverage;
  final int ratingCount;

  factory CompanyVisibleWorkerProfile.fromJson(Map<String, dynamic> json) {
    return CompanyVisibleWorkerProfile(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      position: json['position'] as String? ?? '',
      profilePhotoUrl: json['profile_photo_url'] as String?,
      skills: _stringList(json['skills']),
      languages: _stringList(json['languages']),
      documents: _list(
        json['documents'],
      ).map(CompanyVisibleWorkerDocument.fromJson).toList(),
      workHistorySummary: json['work_history_summary'] as String?,
      workHistory: _list(
        json['work_history'],
      ).map(WorkerExperienceSummary.fromJson).toList(),
      ratingAverage: _double(json['rating_avg']),
      ratingCount: _int(json['rating_count'], 0),
    );
  }
}

class WorkerExperienceSummary {
  const WorkerExperienceSummary({
    required this.companyName,
    required this.position,
    required this.note,
  });

  final String companyName;
  final String position;
  final String note;

  factory WorkerExperienceSummary.fromJson(Map<String, dynamic> json) {
    return WorkerExperienceSummary(
      companyName: json['company_name'] as String? ?? '',
      position: json['position'] as String? ?? '',
      note: json['note'] as String? ?? '',
    );
  }
}

class CompanyVisibleWorkerDocument {
  const CompanyVisibleWorkerDocument({
    required this.type,
    required this.url,
    this.name,
  });

  final String type;
  final String url;
  final String? name;

  factory CompanyVisibleWorkerDocument.fromJson(Map<String, dynamic> json) {
    return CompanyVisibleWorkerDocument(
      type: json['type'] as String? ?? '',
      url: json['url'] as String? ?? '',
      name: json['name'] as String?,
    );
  }
}

class QrTokenResult {
  const QrTokenResult({
    required this.assignmentId,
    required this.orderId,
    required this.token,
    required this.expiresAt,
  });

  final String assignmentId;
  final String orderId;
  final String token;
  final DateTime? expiresAt;

  factory QrTokenResult.fromJson(Map<String, dynamic> json) {
    return QrTokenResult(
      assignmentId: json['assignment_id'] as String? ?? '',
      orderId: json['order_id'] as String? ?? '',
      token: json['token'] as String? ?? '',
      expiresAt: _date(json['expires_at']),
    );
  }
}

class AdminReportSummary {
  const AdminReportSummary({required this.dashboard, required this.reports});

  final AdminReportDashboard dashboard;
  final AdminReports reports;

  factory AdminReportSummary.fromJson(Map<String, dynamic> json) {
    return AdminReportSummary(
      dashboard: AdminReportDashboard.fromJson(
        json['dashboard'] as Map<String, dynamic>? ?? const {},
      ),
      reports: AdminReports.fromJson(
        json['reports'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class AdminReportDashboard {
  const AdminReportDashboard({
    required this.todayActiveOrders,
    required this.pendingOrders,
    required this.activeAssignments,
    required this.checkedInWorkersToday,
    required this.rejectedAssignments,
    required this.pendingWorkerApprovals,
    required this.pendingCompanyApprovals,
  });

  final int todayActiveOrders;
  final int pendingOrders;
  final int activeAssignments;
  final int checkedInWorkersToday;
  final int rejectedAssignments;
  final int pendingWorkerApprovals;
  final int pendingCompanyApprovals;

  factory AdminReportDashboard.fromJson(Map<String, dynamic> json) {
    return AdminReportDashboard(
      todayActiveOrders: _int(json['today_active_orders'], 0),
      pendingOrders: _int(json['pending_orders'], 0),
      activeAssignments: _int(json['active_assignments'], 0),
      checkedInWorkersToday: _int(json['checked_in_workers_today'], 0),
      rejectedAssignments: _int(json['rejected_assignments'], 0),
      pendingWorkerApprovals: _int(json['pending_worker_approvals'], 0),
      pendingCompanyApprovals: _int(json['pending_company_approvals'], 0),
    );
  }
}

class AdminReports {
  const AdminReports({
    required this.attendance,
    required this.ratingStats,
    this.workerDetail,
  });

  final AdminReportAttendance attendance;
  final AdminReportRatingStats ratingStats;
  final AdminWorkerReportDetail? workerDetail;

  factory AdminReports.fromJson(Map<String, dynamic> json) {
    final workerDetailJson = json['worker_detail'];
    return AdminReports(
      attendance: AdminReportAttendance.fromJson(
        json['attendance'] as Map<String, dynamic>? ?? const {},
      ),
      ratingStats: AdminReportRatingStats.fromJson(
        json['rating_stats'] as Map<String, dynamic>? ?? const {},
      ),
      workerDetail: workerDetailJson is Map<String, dynamic>
          ? AdminWorkerReportDetail.fromJson(workerDetailJson)
          : null,
    );
  }
}

class AdminReportAttendance {
  const AdminReportAttendance({
    required this.totalCount,
    required this.completedCount,
    required this.openCount,
  });

  final int totalCount;
  final int completedCount;
  final int openCount;

  factory AdminReportAttendance.fromJson(Map<String, dynamic> json) {
    return AdminReportAttendance(
      totalCount: _int(json['total_count'], 0),
      completedCount: _int(json['completed_count'], 0),
      openCount: _int(json['open_count'], 0),
    );
  }
}

class AdminReportRatingStats {
  const AdminReportRatingStats({required this.average, required this.count});

  final double average;
  final int count;

  factory AdminReportRatingStats.fromJson(Map<String, dynamic> json) {
    return AdminReportRatingStats(
      average: _double(json['average']),
      count: _int(json['count'], 0),
    );
  }
}

class AdminWorkerReportDetail {
  const AdminWorkerReportDetail({
    required this.workerId,
    required this.workerName,
    required this.workerClass,
    required this.workCount,
    required this.checkoutCompletedCount,
    required this.companyNames,
    required this.ratingAverage,
    required this.ratingCount,
  });

  final String workerId;
  final String workerName;
  final String? workerClass;
  final int workCount;
  final int checkoutCompletedCount;
  final List<String> companyNames;
  final double ratingAverage;
  final int ratingCount;

  factory AdminWorkerReportDetail.fromJson(Map<String, dynamic> json) {
    return AdminWorkerReportDetail(
      workerId: json['worker_id'] as String? ?? '',
      workerName: json['worker_name'] as String? ?? '',
      workerClass: json['worker_class'] as String?,
      workCount: _int(json['work_count'], 0),
      checkoutCompletedCount: _int(json['checkout_completed_count'], 0),
      companyNames: _stringList(json['company_names']),
      ratingAverage: _double(json['rating_average']),
      ratingCount: _int(json['rating_count'], 0),
    );
  }
}

int _int(Object? value, int fallback) => value is int ? value : fallback;

double _double(Object? value) => value is num ? value.toDouble() : 0;

List<String> _stringList(Object? value) {
  if (value is! List) return const [];
  return value
      .map((item) {
        if (item is String) return item;
        if (item is Map<String, dynamic>) return item['name'] as String? ?? '';
        return '';
      })
      .where((item) => item.trim().isNotEmpty)
      .toList(growable: false);
}

DateTime? _date(Object? value) {
  if (value is! String) return null;
  return DateTime.tryParse(value)?.toLocal();
}

List<Map<String, dynamic>> _list(Object? value) {
  if (value is! List) return const [];
  return value.whereType<Map<String, dynamic>>().toList();
}
