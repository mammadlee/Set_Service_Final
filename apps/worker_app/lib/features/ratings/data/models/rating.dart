class RatingPage {
  const RatingPage({
    required this.average,
    required this.count,
    required this.data,
  });

  final double average;
  final int count;
  final List<WorkerRating> data;

  factory RatingPage.fromJson(Map<String, dynamic> json) {
    final rawData = json['data'] ?? json['ratings'];
    return RatingPage(
      average: _double(json['rating_avg'] ?? json['avg']),
      count: _int(json['rating_count'] ?? json['total']),
      data: rawData is List
          ? rawData
                .whereType<Map<String, dynamic>>()
                .map(WorkerRating.fromJson)
                .toList(growable: false)
          : const [],
    );
  }
}

class WorkerRating {
  const WorkerRating({
    required this.id,
    required this.assignmentId,
    required this.orderId,
    required this.score,
    required this.feedback,
    required this.createdAt,
    required this.orderTitle,
    required this.companyName,
  });

  final String id;
  final String assignmentId;
  final String orderId;
  final int score;
  final String feedback;
  final DateTime? createdAt;
  final String orderTitle;
  final String companyName;

  factory WorkerRating.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map<String, dynamic>? ?? const {};
    final company = order['company'] as Map<String, dynamic>? ?? const {};
    return WorkerRating(
      id: json['id'] as String? ?? '',
      assignmentId: json['assignment_id'] as String? ?? '',
      orderId: json['order_id'] as String? ?? '',
      score: _int(json['score']),
      feedback: (json['feedback'] ?? json['comment']) as String? ?? '',
      createdAt: _date(json['created_at']),
      orderTitle: order['title'] as String? ?? '',
      companyName: company['name'] as String? ?? '',
    );
  }
}

int _int(Object? value) => value is int ? value : 0;

double _double(Object? value) {
  if (value is num) return value.toDouble();
  return 0;
}

DateTime? _date(Object? value) {
  if (value is! String) return null;
  return DateTime.tryParse(value)?.toLocal();
}
