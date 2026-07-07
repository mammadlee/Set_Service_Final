import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/app_logo.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../../../app_shell/presentation/multi_role_gate.dart';
import '../controllers/auth_controller.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController(text: '+994');
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();

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
                AppStrings.loginTitle,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displaySmall?.copyWith(
                  color: BrandColors.darkText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Telefon nömrənizlə hesabınıza daxil olun.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: BrandColors.darkText,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 28),
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
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: AppStrings.phoneNumber,
                  hintText: AppStrings.phoneHint,
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
                validator: _validatePhone,
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
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: auth.isSubmitting
                      ? null
                      : () =>
                            Navigator.of(context).pushNamed(AppRoutes.register),
                  icon: const Icon(Icons.person_add_alt_1_outlined),
                  label: const Text(AppStrings.createWorkerAccount),
                ),
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
    await context.read<AuthController>().loginWorker(
      phone: _phoneController.text.trim(),
      password: _passwordController.text,
    );
  }

  Future<void> _forgot(BuildContext context) async {
    final result = await _showForgotPasswordSheet(context);
    if (result == null || !context.mounted) return;
    if (result.method == 'phone') {
      if (_validatePhone(result.value) != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.phoneValidation)),
        );
        return;
      }
      await context.read<AuthController>().forgotPasswordByPhone(result.value);
      return;
    }
    if (!_validEmail(result.value)) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(AppStrings.emailValidation)));
      return;
    }
    await context.read<AuthController>().forgotPasswordByEmail(result.value);
  }

  Future<_ForgotPasswordResult?> _showForgotPasswordSheet(
    BuildContext context,
  ) async {
    final phoneController = TextEditingController(text: _phoneController.text);
    final emailController = TextEditingController();
    var method = 'phone';
    try {
      return await showModalBottomSheet<_ForgotPasswordResult>(
        context: context,
        isScrollControlled: true,
        showDragHandle: false,
        backgroundColor: BrandColors.creamBackground,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
        ),
        builder: (sheetContext) => StatefulBuilder(
          builder: (context, setSheetState) => AnimatedPadding(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(sheetContext).bottom,
            ),
            child: SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(18, 4, 18, 18),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 44,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 24),
                        decoration: BoxDecoration(
                          color: BrandColors.darkText,
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                    Text(
                      AppStrings.forgotPassword,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: SegmentedButton<String>(
                        expandedInsets: EdgeInsets.zero,
                        segments: const [
                          ButtonSegment(
                            value: 'phone',
                            label: Text('Telefon nömrəsi ilə'),
                          ),
                          ButtonSegment(
                            value: 'email',
                            label: Text('Email ilə'),
                          ),
                        ],
                        selected: {method},
                        onSelectionChanged: (value) =>
                            setSheetState(() => method = value.first),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: method == 'phone'
                          ? phoneController
                          : emailController,
                      keyboardType: method == 'phone'
                          ? TextInputType.phone
                          : TextInputType.emailAddress,
                      decoration: InputDecoration(
                        labelText: method == 'phone'
                            ? AppStrings.phoneNumber
                            : AppStrings.email,
                        hintText: method == 'phone'
                            ? AppStrings.phoneHint
                            : AppStrings.emailHint,
                        prefixIcon: Icon(
                          method == 'phone'
                              ? Icons.phone_outlined
                              : Icons.email_outlined,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    LoadingButton(
                      label: AppStrings.sendOtp,
                      icon: Icons.password_outlined,
                      loading: false,
                      onPressed: () => Navigator.of(sheetContext).pop(
                        _ForgotPasswordResult(
                          method: method,
                          value:
                              (method == 'phone'
                                      ? phoneController.text
                                      : emailController.text)
                                  .trim(),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 350));
      phoneController.dispose();
      emailController.dispose();
    }
  }

  String? _validatePhone(String? value) {
    final phone = value?.trim() ?? '';
    if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(phone)) {
      return AppStrings.phoneValidation;
    }
    return null;
  }

  String? _validatePassword(String? value) {
    if ((value ?? '').length < 8) return AppStrings.passwordValidation;
    return null;
  }

  bool _validEmail(String value) {
    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value.trim());
  }
}

class _ForgotPasswordResult {
  const _ForgotPasswordResult({required this.method, required this.value});

  final String method;
  final String value;
}
