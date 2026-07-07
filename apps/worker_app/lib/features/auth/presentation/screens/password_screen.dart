import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../controllers/auth_controller.dart';

class PasswordScreen extends StatefulWidget {
  const PasswordScreen({super.key});

  @override
  State<PasswordScreen> createState() => _PasswordScreenState();
}

class _PasswordScreenState extends State<PasswordScreen> {
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
    final auth = context.watch<AuthController>();
    final isReset = auth.pendingPurpose == OtpPurpose.workerPasswordReset;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: auth.isSubmitting
              ? null
              : () => context.read<AuthController>().backToLogin(),
        ),
        title: Text(
          isReset ? AppStrings.resetPassword : AppStrings.createPassword,
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
                AppStrings.createNewPassword,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: BrandColors.darkText,
                  fontWeight: FontWeight.w800,
                ),
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
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit(BuildContext context) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final auth = context.read<AuthController>();
    if (auth.pendingPurpose == OtpPurpose.workerPasswordReset) {
      await auth.resetPassword(password: _passwordController.text);
      return;
    }
    await auth.completeRegistration(password: _passwordController.text);
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
