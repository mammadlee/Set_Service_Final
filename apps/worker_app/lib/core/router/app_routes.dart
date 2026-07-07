import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../features/assignments/presentation/screens/assignment_detail_screen.dart';
import '../../features/auth/presentation/controllers/auth_controller.dart';
import '../../features/auth/presentation/screens/auth_gate.dart';
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../shared/app_strings.dart';

class AppRoutes {
  static const register = '/register';
  static const assignmentDetail = '/assignment-detail';

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
          return _ProtectedRoute(
            child: AssignmentDetailScreen(assignmentId: assignmentId),
          );
        },
      ),
      _ => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => const _RouteNotFoundScreen(),
      ),
    };
  }
}

class _ProtectedRoute extends StatelessWidget {
  const _ProtectedRoute({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    if (auth.state == AuthViewState.authenticated) return child;
    return const AuthGate();
  }
}

class _RouteNotFoundScreen extends StatelessWidget {
  const _RouteNotFoundScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: Text(AppStrings.notFound)));
  }
}
