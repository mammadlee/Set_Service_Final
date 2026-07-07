class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.type,
    required this.channel,
    required this.title,
    required this.body,
    required this.metadata,
    required this.readAt,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String channel;
  final String title;
  final String body;
  final Map<String, dynamic> metadata;
  final DateTime? readAt;
  final DateTime? createdAt;

  bool get isUnread => readAt == null;

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    return NotificationItem(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      channel: json['channel'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      metadata: json['metadata'] is Map<String, dynamic>
          ? json['metadata'] as Map<String, dynamic>
          : const {},
      readAt: _date(json['read_at']),
      createdAt: _date(json['created_at']),
    );
  }
}

class NotificationPage {
  const NotificationPage({required this.data, required this.meta});

  final List<NotificationItem> data;
  final NotificationMeta meta;

  factory NotificationPage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    return NotificationPage(
      data: data is List
          ? data
                .whereType<Map<String, dynamic>>()
                .map(NotificationItem.fromJson)
                .toList()
          : const [],
      meta: NotificationMeta.fromJson(
        json['meta'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class NotificationMeta {
  const NotificationMeta({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  final int page;
  final int limit;
  final int total;
  final int totalPages;

  factory NotificationMeta.fromJson(Map<String, dynamic> json) {
    return NotificationMeta(
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
