import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import 'company_auth_controller.dart';

class CompanyOtpScreen extends StatefulWidget {
  const CompanyOtpScreen({super.key});

  @override
  State<CompanyOtpScreen> createState() => _CompanyOtpScreenState();
}

class _CompanyOtpScreenState extends State<CompanyOtpScreen> {
  final _formKey = GlobalKey<FormState>();
  final _otpController = TextEditingController();

  @override
  void dispose() {
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<CompanyAuthController>();
    final isReset =
        auth.pendingPurpose == CompanyPendingOtpPurpose.passwordReset;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          isReset ? AppStrings.resetPassword : AppStrings.verifyRegistration,
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: auth.isSubmitting
              ? null
              : () => context.read<CompanyAuthController>().backToLogin(),
        ),
      ),
      body: ConstrainedPage(
        showBackdrop: true,
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              const SizedBox(height: 150),
              Text(
                AppStrings.enterOtpTitle,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: BrandColors.darkText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                isReset
                    ? (auth.pendingEmail?.isNotEmpty == true
                          ? 'Təsdiq kodu ${auth.pendingEmail} ünvanına göndərildi.'
                          : AppStrings.otpSentTo(auth.pendingPhone))
                    : AppStrings.otpSentTo(auth.pendingPhone),
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: BrandColors.mutedBrown),
              ),
              const SizedBox(height: 24),
              if (auth.errorMessage != null) ...[
                InlineMessage(
                  message: auth.errorMessage!,
                  kind: InlineMessageKind.error,
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(
                controller: _otpController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(
                  labelText: AppStrings.otpCode,
                  counterText: '',
                ),
                validator: (value) =>
                    RegExp(r'^\d{6}$').hasMatch(value?.trim() ?? '')
                    ? null
                    : AppStrings.otpValidation,
                onFieldSubmitted: (_) => _submit(context),
              ),
              const SizedBox(height: 20),
              LoadingButton(
                label: AppStrings.verifyOtp,
                loading: auth.isSubmitting,
                onPressed: () => _submit(context),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _submit(BuildContext context) {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    context.read<CompanyAuthController>().submitOtpCode(
      _otpController.text.trim(),
    );
  }
}
