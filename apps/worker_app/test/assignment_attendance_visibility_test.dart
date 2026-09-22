import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/features/assignments/data/models/assignment.dart';

void main() {
  Assignment assignment(String assignmentStatus, String orderStatus) =>
      Assignment.fromJson({
        'id': 'assignment-1',
        'order_id': 'order-1',
        'status': assignmentStatus,
        'order': {'id': 'order-1', 'status': orderStatus},
        'worker': {'id': 'worker-1'},
      });

  test('accepted worker can open QR attendance for every live order state', () {
    for (final status in [
      'published',
      'partially_assigned',
      'assigned',
      'active',
      'in_progress',
    ]) {
      expect(
        assignment('accepted', status).canUseAttendance,
        isTrue,
        reason: 'Order state $status must not hide the scanner',
      );
    }
  });

  test('QR attendance remains hidden without an accepted assignment', () {
    for (final status in ['assigned', 'rejected', 'cancelled', 'completed']) {
      expect(assignment(status, 'published').canUseAttendance, isFalse);
    }
    for (final status in ['draft', 'cancelled', 'completed']) {
      expect(assignment('accepted', status).canUseAttendance, isFalse);
    }
  });
}
