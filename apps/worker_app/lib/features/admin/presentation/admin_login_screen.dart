import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/theme/app_theme.dart';
import '../../app_shell/presentation/multi_role_gate.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/app_logo.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import 'admin_auth_controller.dart';

class AdminLoginScreen extends StatefulWidget {
  const AdminLoginScreen({super.key});

  @override
  State<AdminLoginScreen> createState() => _AdminLoginScreenState();
}

class _AdminLoginScreenState extends State<AdminLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AdminAuthController>();
    return Scaffold(
      body: ConstrainedPage(
        showBackdrop: true,
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              const SizedBox(height: 36),
              const Center(child: AppLogo(size: 72)),
              const SizedBox(height: 78),
              Text(
                'Daxil ol',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displaySmall?.copyWith(
                  color: BrandColors.darkText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'E-poçt ünvanınız və şifrənizlə admin hesabınıza daxil olun.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: BrandColors.darkText,
                  height: 1.35,
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
              if (auth.successMessage != null) ...[
                InlineMessage(
                  message: auth.successMessage!,
                  kind: InlineMessageKind.success,
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: AppStrings.email,
                  hintText: AppStrings.emailHint,
                  prefixIcon: Icon(Icons.alternate_email_rounded),
                ),
                validator: _validateEmail,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  labelText: AppStrings.password,
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
                onFieldSubmitted: (_) => _submit(context),
              ),
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: auth.isSubmitting ? null : () => _forgot(context),
                  child: const Text(AppStrings.forgotPassword),
                ),
              ),
              const SizedBox(height: 18),
              LoadingButton(
                label: AppStrings.loginTitle,
                icon: Icons.login_outlined,
                loading: auth.isSubmitting,
                onPressed: () => _submit(context),
              ),
              const SizedBox(height: 18),
              const RoleAwareBackButton(),
              const SizedBox(height: 36),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit(BuildContext context) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    await context.read<AdminAuthController>().loginAdmin(
      email: _emailController.text.trim(),
      password: _passwordController.text,
    );
  }

  Future<void> _forgot(BuildContext context) async {
    if (_validateEmail(_emailController.text) != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(AppStrings.emailValidation)));
      return;
    }
    await context.read<AdminAuthController>().forgotPassword(
      _emailController.text.trim(),
    );
  }

  String? _validateEmail(String? value) {
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value?.trim() ?? '')) {
      return AppStrings.emailValidation;
    }
    return null;
  }

  String? _validatePassword(String? value) {
    if ((value ?? '').length < 8) return AppStrings.passwordValidation;
    return null;
  }
}
