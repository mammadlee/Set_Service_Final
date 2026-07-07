class Assignment {
  const Assignment({
    required this.id,
    required this.orderId,
    required this.workerId,
    required this.category,
    required this.status,
    required this.assignedAt,
    required this.updatedAt,
    required this.order,
    required this.worker,
  });

  final String id;
  final String orderId;
  final String workerId;
  final String category;
  final String status;
  final DateTime? assignedAt;
  final DateTime? updatedAt;
  final AssignmentOrder order;
  final AssignmentWorker worker;

  bool get canAcceptOrReject => status == 'assigned';
  bool get canUseAttendance => status == 'accepted' && order.status == 'active';

  factory Assignment.fromJson(Map<String, dynamic> json) {
    return Assignment(
      id: json['id'] as String? ?? '',
      orderId: json['order_id'] as String? ?? '',
      workerId: json['worker_id'] as String? ?? '',
      category:
          json['category'] as String? ??
          json['assigned_category'] as String? ??
          '',
      status: json['status'] as String? ?? '',
      assignedAt: _date(json['assigned_at']),
      updatedAt: _date(json['updated_at']),
      order: AssignmentOrder.fromJson(
        json['order'] as Map<String, dynamic>? ?? const {},
      ),
      worker: AssignmentWorker.fromJson(
        json['worker'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class AssignmentOrder {
  const AssignmentOrder({
    required this.id,
    required this.title,
    required this.category,
    required this.status,
    required this.requiredCount,
    required this.startDatetime,
    required this.endDatetime,
    required this.location,
    required this.company,
  });

  final String id;
  final String title;
  final String category;
  final String status;
  final int requiredCount;
  final DateTime? startDatetime;
  final DateTime? endDatetime;
  final String location;
  final AssignmentCompany company;

  factory AssignmentOrder.fromJson(Map<String, dynamic> json) {
    return AssignmentOrder(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      category: json['category'] as String? ?? '',
      status: json['status'] as String? ?? '',
      requiredCount: json['required_count'] is int
          ? json['required_count'] as int
          : 0,
      startDatetime: _date(json['start_datetime']),
      endDatetime: _date(json['end_datetime']),
      location: json['location'] as String? ?? '',
      company: AssignmentCompany.fromJson(
        json['company'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class AssignmentCompany {
  const AssignmentCompany({
    required this.id,
    required this.name,
    required this.status,
    required this.phone,
  });

  final String id;
  final String name;
  final String status;
  final String phone;

  factory AssignmentCompany.fromJson(Map<String, dynamic> json) {
    return AssignmentCompany(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      status: json['status'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
    );
  }
}

class AssignmentWorker {
  const AssignmentWorker({
    required this.id,
    required this.name,
    required this.phone,
    required this.status,
    required this.availability,
    required this.position,
  });

  final String id;
  final String name;
  final String phone;
  final String status;
  final bool availability;
  final String position;

  factory AssignmentWorker.fromJson(Map<String, dynamic> json) {
    return AssignmentWorker(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      status: json['status'] as String? ?? '',
      availability: json['availability'] == true,
      position: json['position'] as String? ?? '',
    );
  }
}

class AssignmentPage {
  const AssignmentPage({required this.data, required this.meta});

  final List<Assignment> data;
  final PageMeta meta;

  factory AssignmentPage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    return AssignmentPage(
      data: data is List
          ? data
                .whereType<Map<String, dynamic>>()
                .map(Assignment.fromJson)
                .toList()
          : const [],
      meta: PageMeta.fromJson(
        json['meta'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

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
      page: json['page'] is int ? json['page'] as int : 1,
      limit: json['limit'] is int ? json['limit'] as int : 20,
      total: json['total'] is int ? json['total'] as int : 0,
      totalPages: json['total_pages'] is int ? json['total_pages'] as int : 0,
    );
  }
}

DateTime? _date(Object? value) {
  if (value is! String) return null;
  return DateTime.tryParse(value)?.toLocal();
}
