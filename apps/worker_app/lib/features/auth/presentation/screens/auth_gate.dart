import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../home/presentation/screens/worker_home_shell.dart';
import '../controllers/auth_controller.dart';
import 'account_blocked_screen.dart';
import 'login_screen.dart';
import 'otp_screen.dart';
import 'password_screen.dart';
import 'pending_approval_screen.dart';
import 'splash_screen.dart';

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();

    return switch (auth.state) {
      AuthViewState.splash => const SplashScreen(),
      AuthViewState.unauthenticated => const LoginScreen(),
      AuthViewState.otpRequired => const OtpScreen(),
      AuthViewState.passwordRequired => const PasswordScreen(),
      AuthViewState.pendingApproval => const PendingApprovalScreen(),
      AuthViewState.accountBlocked => const AccountBlockedScreen(),
      AuthViewState.authenticated => const WorkerHomeShell(),
    };
  }
}
