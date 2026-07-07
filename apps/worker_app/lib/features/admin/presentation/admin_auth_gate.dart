import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../auth/presentation/screens/splash_screen.dart';
import 'admin_auth_controller.dart';
import 'admin_home_shell.dart';
import 'admin_login_screen.dart';

class AdminAuthGate extends StatelessWidget {
  const AdminAuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AdminAuthController>();
    return switch (auth.state) {
      AdminAuthState.splash => const SplashScreen(),
      AdminAuthState.unauthenticated => const AdminLoginScreen(),
      AdminAuthState.authenticated => const AdminHomeShell(),
    };
  }
}
