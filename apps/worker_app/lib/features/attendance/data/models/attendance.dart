class AttendanceLog {
  const AttendanceLog({
    required this.id,
    required this.assignmentId,
    required this.checkinTime,
    required this.checkoutTime,
    required this.durationMinutes,
    required this.checkinNotes,
    required this.checkoutNotes,
  });

  final String id;
  final String assignmentId;
  final DateTime? checkinTime;
  final DateTime? checkoutTime;
  final int? durationMinutes;
  final String? checkinNotes;
  final String? checkoutNotes;

  bool get isOpen => checkinTime != null && checkoutTime == null;

  factory AttendanceLog.fromJson(Map<String, dynamic> json) {
    return AttendanceLog(
      id: json['id'] as String? ?? '',
      assignmentId: json['assignment_id'] as String? ?? '',
      checkinTime: _date(json['checkin_time']),
      checkoutTime: _date(json['checkout_time']),
      durationMinutes: json['duration_minutes'] is int
          ? json['duration_minutes'] as int
          : null,
      checkinNotes: json['checkin_notes'] as String?,
      checkoutNotes: json['checkout_notes'] as String?,
    );
  }
}

class AttendancePage {
  const AttendancePage({required this.data});

  final List<AttendanceLog> data;

  factory AttendancePage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    return AttendancePage(
      data: data is List
          ? data
                .whereType<Map<String, dynamic>>()
                .map(AttendanceLog.fromJson)
                .toList()
          : const [],
    );
  }
}

DateTime? _date(Object? value) {
  if (value is! String) return null;
  return DateTime.tryParse(value)?.toLocal();
}
