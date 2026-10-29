import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/push/push_deep_link.dart';
import 'package:worker_app/core/router/app_routes.dart';
import 'package:worker_app/core/session/app_role.dart';

const assignmentId = '550e8400-e29b-41d4-a716-446655440000';
const companyOrderId = '550e8400-e29b-41d4-a716-446655440001';
const adminOrderId = '550e8400-e29b-41d4-a716-446655440002';

void main() {
  group('resolvePushDeepLink', () {
    test('opens worker assignment only in the active worker role', () {
      final link = resolvePushDeepLink({
        'role': 'worker',
        'assignment_id': ' $assignmentId ',
      }, AppRole.worker);

      expect(link?.routeName, AppRoutes.assignmentDetail);
      expect(link?.argument, assignmentId);
    });

    test('opens company order and supports legacy role-less payloads', () {
      final link = resolvePushDeepLink({
        'order_id': companyOrderId,
      }, AppRole.company);

      expect(link?.routeName, AppRoutes.companyOrderDetail);
      expect(link?.argument, companyOrderId);
    });

    test('maps admin and super_admin payloads to the admin order route', () {
      for (final role in ['admin', 'super_admin']) {
        final link = resolvePushDeepLink({
          'app_role': role,
          'order_id': adminOrderId,
        }, AppRole.admin);
        expect(link?.routeName, AppRoutes.adminOrderDetail);
        expect(link?.argument, adminOrderId);
      }
    });

    test('falls back to role-scoped notification lists without entity ids', () {
      expect(
        resolvePushDeepLink({}, AppRole.worker)?.routeName,
        AppRoutes.workerNotifications,
      );
      expect(
        resolvePushDeepLink({}, AppRole.company)?.routeName,
        AppRoutes.companyNotifications,
      );
      expect(
        resolvePushDeepLink({}, AppRole.admin)?.routeName,
        AppRoutes.adminNotifications,
      );
    });

    test('rejects explicit cross-role and unknown-role payloads', () {
      expect(
        resolvePushDeepLink({
          'role': 'company',
          'assignment_id': assignmentId,
        }, AppRole.worker),
        isNull,
      );
      expect(resolvePushDeepLink({'role': 'unknown'}, AppRole.admin), isNull);
    });

    test('never builds entity routes from malformed external identifiers', () {
      final workerLink = resolvePushDeepLink({
        'assignment_id': '../orders/$companyOrderId',
      }, AppRole.worker);
      final companyLink = resolvePushDeepLink({
        'order_id': 'order-1',
      }, AppRole.company);
      final adminLink = resolvePushDeepLink({
        'order_id': '$adminOrderId/assignments',
      }, AppRole.admin);

      expect(workerLink?.routeName, AppRoutes.workerNotifications);
      expect(workerLink?.argument, isNull);
      expect(companyLink?.routeName, AppRoutes.companyNotifications);
      expect(companyLink?.argument, isNull);
      expect(adminLink?.routeName, AppRoutes.adminNotifications);
      expect(adminLink?.argument, isNull);
    });
  });
}
