import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/session/role_session_controller.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../controllers/auth_controller.dart';

class PendingApprovalScreen extends StatelessWidget {
  const PendingApprovalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();

    return Scaffold(
      appBar: AppBar(title: const Text('Qeydiyyatı təsdiqlə')),
      body: ConstrainedPage(
        showBackdrop: true,
        child: CustomScrollView(
          slivers: [
            SliverFillRemaining(
              hasScrollBody: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Spacer(),
                  const Icon(
                    Icons.hourglass_top_outlined,
                    size: 74,
                    color: BrandColors.accentGold,
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Təsdiq gözlənilir...',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: BrandColors.darkText,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          context.read<RoleSessionController>().clearRole(),
                      icon: const Icon(Icons.swap_horiz_rounded),
                      label: const Text(AppStrings.changeRole),
                    ),
                  ),
                  const SizedBox(height: 12),
                  LoadingButton(
                    label: AppStrings.backToLogin,
                    loading: auth.isSubmitting,
                    onPressed: () =>
                        context.read<AuthController>().backToLogin(),
                  ),
                  if (auth.errorMessage != null) ...[
                    const SizedBox(height: 18),
                    InlineMessage(
                      message: auth.errorMessage!,
                      kind: InlineMessageKind.info,
                    ),
                  ],
                  const SizedBox(height: 18),
                  const InlineMessage(
                    message: 'İşçi hesabınız admin təsdiqini gözləyir.',
                  ),
                  const Spacer(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
