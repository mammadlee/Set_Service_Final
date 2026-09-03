import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/session/app_role.dart';
import '../../../core/session/role_session_controller.dart';
import '../../../shared/app_strings.dart';
import '../../admin/presentation/admin_auth_gate.dart';
import '../../auth/presentation/screens/auth_gate.dart';
import '../../auth/presentation/screens/splash_screen.dart';
import '../../company/presentation/company_auth_gate.dart';

class MultiRoleGate extends StatelessWidget {
  const MultiRoleGate({super.key});

  @override
  Widget build(BuildContext context) {
    final roleSession = context.watch<RoleSessionController>();

    final child = roleSession.loading
        ? const SplashScreen()
        : switch (roleSession.activeRole) {
            AppRole.company => const CompanyAuthGate(),
            AppRole.admin => const AdminAuthGate(),
            AppRole.worker || null => const AuthGate(),
          };

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 180),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      child: KeyedSubtree(
        key: ValueKey(
          roleSession.loading
              ? 'loading'
              : roleSession.activeRole?.name ?? 'worker',
        ),
        child: child,
      ),
    );
  }
}

class RoleAwareBackButton extends StatelessWidget {
  const RoleAwareBackButton({super.key});

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: () => context.read<RoleSessionController>().clearRole(),
      icon: const Icon(Icons.swap_horiz),
      label: const Text(AppStrings.changeRole),
    );
  }
}
