import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import 'company_auth_controller.dart';

class CompanyPasswordScreen extends StatefulWidget {
  const CompanyPasswordScreen({super.key});

  @override
  State<CompanyPasswordScreen> createState() => _CompanyPasswordScreenState();
}

class _CompanyPasswordScreenState extends State<CompanyPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<CompanyAuthController>();
    final isReset =
        auth.pendingPurpose == CompanyPendingOtpPurpose.passwordReset;
    final height = MediaQuery.sizeOf(context).height;
    final topSpace = height < 700 ? 22.0 : height < 820 ? 38.0 : 58.0;

    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: Text(
          isReset ? AppStrings.resetPassword : AppStrings.createPassword,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
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
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
            ),
            children: [
              SizedBox(height: topSpace),
              Text(
                AppStrings.createNewPassword,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: BrandColors.darkText,
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                AppStrings.passwordValidation,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: BrandColors.mutedBrown,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 22),
              if (auth.errorMessage != null) ...[
                InlineMessage(
                  message: auth.errorMessage!,
                  kind: InlineMessageKind.error,
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: isReset
                      ? AppStrings.newPassword
                      : AppStrings.createPassword,
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    onPressed: () =>
                        setState(() => _obscurePassword = !_obscurePassword),
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
                validator: _validatePassword,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _confirmPasswordController,
                obscureText: _obscurePassword,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: AppStrings.confirmPassword,
                  prefixIcon: Icon(Icons.lock_reset_outlined),
                ),
                validator: _validatePasswordConfirm,
                onFieldSubmitted: (_) => _submit(context),
              ),
              const SizedBox(height: 20),
              LoadingButton(
                label: isReset
                    ? AppStrings.saveNewPassword
                    : AppStrings.createPassword,
                loading: auth.isSubmitting,
                onPressed: () => _submit(context),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit(BuildContext context) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    await context.read<CompanyAuthController>().completeOtp(
      password: _passwordController.text,
    );
  }

  String? _validatePassword(String? value) {
    if ((value ?? '').length < 8) return AppStrings.passwordValidation;
    if (!RegExp(r'[A-Za-z]').hasMatch(value ?? '') ||
        !RegExp(r'\d').hasMatch(value ?? '')) {
      return AppStrings.passwordValidation;
    }
    return null;
  }

  String? _validatePasswordConfirm(String? value) {
    final message = _validatePassword(value);
    if (message != null) return message;
    if (value != _passwordController.text) {
      return AppStrings.passwordsDoNotMatch;
    }
    return null;
  }
}
