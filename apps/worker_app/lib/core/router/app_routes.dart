import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../features/admin/presentation/admin_auth_controller.dart';
import '../../features/admin/presentation/admin_home_shell.dart';
import '../../features/app_shell/presentation/multi_role_gate.dart';
import '../../features/assignments/presentation/screens/assignment_detail_screen.dart';
import '../../features/auth/presentation/controllers/auth_controller.dart';
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../features/company/presentation/company_auth_controller.dart';
import '../../features/company/presentation/company_home_shell.dart';
import '../../features/notifications/presentation/screens/notifications_screen.dart';
import '../../shared/app_strings.dart';
import '../session/app_role.dart';
import '../session/role_session_controller.dart';

class AppRoutes {
  static const register = '/register';
  static const assignmentDetail = '/assignment-detail';
  static const workerNotifications = '/worker/notifications';
  static const companyOrderDetail = '/company/orders/detail';
  static const companyNotifications = '/company/notifications';
  static const adminOrderDetail = '/admin/orders/detail';
  static const adminNotifications = '/admin/notifications';

  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    return switch (settings.name) {
      register => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => const RegisterScreen(),
      ),
      assignmentDetail => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) {
          final assignmentId = settings.arguments;
          if (assignmentId is! String || assignmentId.isEmpty) {
            return const _RouteNotFoundScreen();
          }
          return _RoleProtectedRoute(
            role: AppRole.worker,
            child: AssignmentDetailScreen(assignmentId: assignmentId),
          );
        },
      ),
      workerNotifications => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => const _RoleProtectedRoute(
          role: AppRole.worker,
          child: _WorkerNotificationsRoute(),
        ),
      ),
      companyOrderDetail => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) {
          final orderId = _routeId(settings.arguments);
          if (orderId == null) return const _RouteNotFoundScreen();
          return _RoleProtectedRoute(
            role: AppRole.company,
            child: CompanyOrderDetailRoute(orderId: orderId),
          );
        },
      ),
      companyNotifications => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => const _RoleProtectedRoute(
          role: AppRole.company,
          child: CompanyNotificationsRoute(),
        ),
      ),
      adminOrderDetail => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) {
          final orderId = _routeId(settings.arguments);
          if (orderId == null) return const _RouteNotFoundScreen();
          return _RoleProtectedRoute(
            role: AppRole.admin,
            adminPermission: 'view_orders',
            child: AdminOrderDetailRoute(orderId: orderId),
          );
        },
      ),
      adminNotifications => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => const _RoleProtectedRoute(
          role: AppRole.admin,
          adminPermission: 'view_notifications',
          child: AdminNotificationsRoute(),
        ),
      ),
      _ => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => const _RouteNotFoundScreen(),
      ),
    };
  }
}

class _RoleProtectedRoute extends StatelessWidget {
  const _RoleProtectedRoute({
    required this.role,
    required this.child,
    this.adminPermission,
  });

  final AppRole role;
  final Widget child;
  final String? adminPermission;

  @override
  Widget build(BuildContext context) {
    final roleSession = context.watch<RoleSessionController>();
    if (roleSession.loading || roleSession.activeRole != role) {
      return const MultiRoleGate();
    }

    final authenticated = switch (role) {
      AppRole.worker =>
        context.watch<AuthController>().state == AuthViewState.authenticated,
      AppRole.company =>
        context.watch<CompanyAuthController>().state ==
            CompanyAuthState.authenticated,
      AppRole.admin =>
        context.watch<AdminAuthController>().state ==
            AdminAuthState.authenticated,
    };
    if (!authenticated) return const MultiRoleGate();

    if (role == AppRole.admin && adminPermission != null) {
      final auth = context.watch<AdminAuthController>();
      if (!auth.hasPermission(adminPermission!)) {
        return const _RouteNotFoundScreen();
      }
    }
    return child;
  }
}

class _WorkerNotificationsRoute extends StatelessWidget {
  const _WorkerNotificationsRoute();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.notifications)),
      body: const NotificationsScreen(),
    );
  }
}

class _RouteNotFoundScreen extends StatelessWidget {
  const _RouteNotFoundScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: Text(AppStrings.notFound)));
  }
}

String? _routeId(Object? argument) {
  if (argument is! String) return null;
  final value = argument.trim();
  return value.isEmpty ? null : value;
}
