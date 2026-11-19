class WorkerRatingSummary {
  const WorkerRatingSummary({
    required this.average,
    required this.total,
    required this.ratings,
  });

  final double average;
  final int total;
  final List<WorkerRating> ratings;

  factory WorkerRatingSummary.fromJson(Map<String, dynamic> json) {
    final entries = json['data'];
    return WorkerRatingSummary(
      average: (json['rating_avg'] as num?)?.toDouble() ?? 0,
      total: (json['rating_count'] as num?)?.toInt() ?? 0,
      ratings: entries is List
          ? entries
                .whereType<Map<String, dynamic>>()
                .map(WorkerRating.fromJson)
                .toList()
          : const [],
    );
  }
}

class WorkerRating {
  const WorkerRating({
    required this.id,
    required this.score,
    required this.feedback,
    required this.orderTitle,
    required this.createdAt,
  });

  final String id;
  final int score;
  final String? feedback;
  final String orderTitle;
  final DateTime? createdAt;

  factory WorkerRating.fromJson(Map<String, dynamic> json) {
    final order = json['order'];
    final orderMap = order is Map<String, dynamic>
        ? order
        : const <String, dynamic>{};
    return WorkerRating(
      id: json['id'] as String? ?? '',
      score: (json['score'] as num?)?.toInt() ?? 0,
      feedback: json['feedback'] as String? ?? json['comment'] as String?,
      orderTitle: orderMap['title'] as String? ?? '',
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
    );
  }
}
