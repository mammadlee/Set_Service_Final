import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/app_logo.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../controllers/auth_controller.dart';

class AccountBlockedScreen extends StatelessWidget {
  const AccountBlockedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final status = auth.blockedStatus ?? 'blocked';

    return Scaffold(
      body: ConstrainedPage(
        child: CustomScrollView(
          slivers: [
            SliverFillRemaining(
              hasScrollBody: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 28),
                  const AppLogo(),
                  const Spacer(),
                  const Icon(
                    Icons.lock_outline,
                    size: 56,
                    color: BrandColors.primaryBurgundy,
                  ),
                  const SizedBox(height: 18),
                  Text(
                    AppStrings.accountUnavailableTitle,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 10),
                  InlineMessage(
                    message: AppStrings.accountMessageForStatus(status),
                    kind: InlineMessageKind.error,
                  ),
                  const Spacer(),
                  LoadingButton(
                    label: AppStrings.backToLogin,
                    icon: Icons.login_outlined,
                    loading: auth.isSubmitting,
                    onPressed: () =>
                        context.read<AuthController>().backToLogin(),
                  ),
                  const SizedBox(height: 12),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
