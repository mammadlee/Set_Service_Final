import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/session/role_session_controller.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import 'company_auth_controller.dart';

class CompanyStatusScreen extends StatelessWidget {
  const CompanyStatusScreen({
    required this.title,
    required this.body,
    required this.icon,
    required this.color,
    super.key,
  });

  final String title;
  final String body;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<CompanyAuthController>();
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.verifyRegistration)),
      body: ConstrainedPage(
        showBackdrop: true,
        child: CustomScrollView(
          slivers: [
            SliverFillRemaining(
              hasScrollBody: false,
              child: Column(
                children: [
                  const Spacer(flex: 3),
                  Icon(icon, size: 78, color: BrandColors.accentGold),
                  const SizedBox(height: 24),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.displaySmall?.copyWith(
                      color: BrandColors.darkText,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 36),
                  OutlinedButton.icon(
                    onPressed: () =>
                        context.read<RoleSessionController>().clearRole(),
                    icon: const Icon(Icons.swap_horiz),
                    label: const Text(AppStrings.changeRole),
                  ),
                  const SizedBox(height: 14),
                  LoadingButton(
                    label: AppStrings.backToLogin,
                    loading: auth.isSubmitting,
                    onPressed: () =>
                        context.read<CompanyAuthController>().backToLogin(),
                  ),
                  const SizedBox(height: 18),
                  InlineMessage(
                    message: body,
                    kind: color == BrandColors.primaryBurgundy
                        ? InlineMessageKind.error
                        : InlineMessageKind.info,
                  ),
                  const Spacer(flex: 2),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
