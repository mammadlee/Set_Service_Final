import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/app_strings.dart';
import '../../auth/presentation/screens/splash_screen.dart';
import 'company_auth_controller.dart';
import 'company_home_shell.dart';
import 'company_login_screen.dart';
import 'company_otp_screen.dart';
import 'company_password_screen.dart';
import 'company_status_screen.dart';

class CompanyAuthGate extends StatelessWidget {
  const CompanyAuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<CompanyAuthController>();
    return switch (auth.state) {
      CompanyAuthState.splash => const SplashScreen(),
      CompanyAuthState.unauthenticated => const CompanyLoginScreen(),
      CompanyAuthState.otpRequired => const CompanyOtpScreen(),
      CompanyAuthState.passwordRequired => const CompanyPasswordScreen(),
      CompanyAuthState.pendingApproval => const CompanyStatusScreen(
        title: AppStrings.pendingApprovalTitle,
        body: AppStrings.companyPendingApprovalMessage,
        icon: Icons.hourglass_top_outlined,
        color: BrandColors.accentGold,
      ),
      CompanyAuthState.accountBlocked => CompanyStatusScreen(
        title: AppStrings.accountUnavailableTitle,
        body: auth.errorMessage ?? AppStrings.companyPendingApprovalMessage,
        icon: Icons.lock_outline,
        color: BrandColors.primaryBurgundy,
      ),
      CompanyAuthState.authenticated => const CompanyHomeShell(),
    };
  }
}
