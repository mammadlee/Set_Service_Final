import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/theme/app_theme.dart';
import '../../app_shell/presentation/multi_role_gate.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/app_logo.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import 'company_auth_controller.dart';

class CompanyLoginScreen extends StatefulWidget {
  const CompanyLoginScreen({super.key});

  @override
  State<CompanyLoginScreen> createState() => _CompanyLoginScreenState();
}

class _CompanyLoginScreenState extends State<CompanyLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<CompanyAuthController>().clearTransientMessages();
    });
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<CompanyAuthController>();
    final height = MediaQuery.sizeOf(context).height;
    final compact = height < 720;
    final logoSize = compact ? 52.0 : 58.0;
    final topGap = compact ? 8.0 : 16.0;
    final logoGap = compact ? 18.0 : 28.0;

    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: ConstrainedPage(
        showBackdrop: true,
        child: Form(
          key: _formKey,
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
            ),
            children: [
              SizedBox(height: topGap),
              Center(child: AppLogo(size: logoSize)),
              SizedBox(height: logoGap),
              Text(
                AppStrings.loginTitle,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.displaySmall?.copyWith(
                  color: BrandColors.darkText,
                  fontWeight: FontWeight.w800,
                  height: 1.08,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                AppStrings.companyLoginSubtitle,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: BrandColors.darkText,
                  height: 1.35,
                ),
              ),
              SizedBox(height: compact ? 20 : 24),
              if (auth.errorMessage != null) ...[
                InlineMessage(
                  message: auth.errorMessage!,
                  kind: InlineMessageKind.error,
                ),
                const SizedBox(height: 14),
              ],
              if (auth.successMessage != null) ...[
                InlineMessage(
                  message: auth.successMessage!,
                  kind: InlineMessageKind.success,
                ),
                const SizedBox(height: 14),
              ],
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: AppStrings.email,
                  hintText: AppStrings.emailHint,
                  prefixIcon: Icon(Icons.email_outlined),
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
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: auth.isSubmitting ? null : () => _forgot(context),
                  child: const Text(AppStrings.forgotPassword),
                ),
              ),
              const SizedBox(height: 14),
              LoadingButton(
                label: AppStrings.loginTitle,
                icon: Icons.login_outlined,
                loading: auth.isSubmitting,
                onPressed: () => _submit(context),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: auth.isSubmitting
                      ? null
                      : () async {
                          context.read<CompanyAuthController>().clearTransientMessages();
                          await Navigator.of(context).push<void>(
                            MaterialPageRoute(
                              builder: (_) => const CompanyRegisterScreen(),
                            ),
                          );
                          if (context.mounted) {
                            context
                                .read<CompanyAuthController>()
                                .clearTransientMessages();
                          }
                        },
                  icon: const Icon(Icons.business_outlined),
                  label: const Text(
                    AppStrings.createCompanyAccount,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const RoleAwareBackButton(),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit(BuildContext context) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    await context.read<CompanyAuthController>().loginCompany(
      email: _emailController.text.trim().toLowerCase(),
      password: _passwordController.text,
    );
  }

  Future<void> _forgot(BuildContext context) async {
    final result = await _showForgotPasswordSheet(context);
    if (result == null || !context.mounted) return;
    if (result.method == 'email') {
      if (_validateEmail(result.value) != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.emailValidation)),
        );
        return;
      }
      await context.read<CompanyAuthController>().forgotPasswordByEmail(
        result.value.trim().toLowerCase(),
      );
      return;
    }
    if (!_validPhone(result.value)) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(AppStrings.phoneValidation)));
      return;
    }
    await context.read<CompanyAuthController>().forgotPasswordByPhone(
      _normalizePhone(result.value),
    );
  }

  Future<_CompanyForgotPasswordResult?> _showForgotPasswordSheet(
    BuildContext context,
  ) async {
    final emailController = TextEditingController(text: _emailController.text);
    final phoneController = TextEditingController(text: '+994');
    var method = 'email';
    try {
      return await showModalBottomSheet<_CompanyForgotPasswordResult>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
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
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
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
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: SegmentedButton<String>(
                        expandedInsets: EdgeInsets.zero,
                        showSelectedIcon: false,
                        segments: const [
                          ButtonSegment(
                            value: 'phone',
                            label: Text('Telefon'),
                          ),
                          ButtonSegment(
                            value: 'email',
                            label: Text('E-poçt'),
                          ),
                        ],
                        selected: {method},
                        onSelectionChanged: (value) =>
                            setSheetState(() => method = value.first),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: method == 'email'
                          ? emailController
                          : phoneController,
                      keyboardType: method == 'email'
                          ? TextInputType.emailAddress
                          : TextInputType.phone,
                      decoration: InputDecoration(
                        labelText: method == 'email'
                            ? AppStrings.email
                            : AppStrings.phoneNumber,
                        hintText: method == 'email'
                            ? AppStrings.emailHint
                            : AppStrings.phoneHint,
                        prefixIcon: Icon(
                          method == 'email'
                              ? Icons.email_outlined
                              : Icons.phone_outlined,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    LoadingButton(
                      label: AppStrings.sendOtp,
                      icon: Icons.password_outlined,
                      loading: false,
                      onPressed: () => Navigator.of(sheetContext).pop(
                        _CompanyForgotPasswordResult(
                          method: method,
                          value:
                              (method == 'email'
                                      ? emailController.text
                                      : phoneController.text)
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
      emailController.dispose();
      phoneController.dispose();
    }
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

  bool _validPhone(String value) {
    return RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(_normalizePhone(value));
  }

  String _normalizePhone(String value) {
    return value.trim().replaceAll(RegExp(r'[\s().-]'), '');
  }
}

class _CompanyForgotPasswordResult {
  const _CompanyForgotPasswordResult({
    required this.method,
    required this.value,
  });

  final String method;
  final String value;
}

class CompanyRegisterScreen extends StatefulWidget {
  const CompanyRegisterScreen({super.key});

  @override
  State<CompanyRegisterScreen> createState() => _CompanyRegisterScreenState();
}

class _CompanyRegisterScreenState extends State<CompanyRegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _contactController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController(text: '+994');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<CompanyAuthController>().clearTransientMessages();
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _contactController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<CompanyAuthController>();
    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: const Text(
          AppStrings.companyRegisterTitle,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: ConstrainedPage(
        showBackdrop: true,
        child: Form(
          key: _formKey,
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
            ),
            children: [
              if (auth.errorMessage != null) ...[
                InlineMessage(
                  message: auth.errorMessage!,
                  kind: InlineMessageKind.error,
                ),
                const SizedBox(height: 16),
              ],
              const SizedBox(height: 18),
              TextFormField(
                controller: _contactController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: AppStrings.contactName,
                  prefixIcon: Icon(Icons.person_outline),
                ),
                validator: (value) => (value ?? '').trim().length < 2
                    ? AppStrings.requiredField
                    : null,
              ),
              const SizedBox(height: 14),
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
                controller: _nameController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: AppStrings.companyName,
                  prefixIcon: Icon(Icons.business_outlined),
                ),
                validator: (value) => (value ?? '').trim().length < 2
                    ? AppStrings.requiredField
                    : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: AppStrings.email,
                  hintText: AppStrings.emailHint,
                  prefixIcon: Icon(Icons.email_outlined),
                ),
                validator: _validateEmail,
                onFieldSubmitted: (_) => _submit(context),
              ),
              const SizedBox(height: 22),
              LoadingButton(
                label: AppStrings.registerAndSendOtp,
                loading: auth.isSubmitting,
                onPressed: () => _submit(context),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit(BuildContext context) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    await context.read<CompanyAuthController>().registerCompany(
      name: _nameController.text.trim(),
      contactName: _contactController.text.trim(),
      email: _emailController.text.trim().toLowerCase(),
      phone: _normalizePhone(_phoneController.text),
    );
    if (!context.mounted) return;
    if (context.read<CompanyAuthController>().state ==
        CompanyAuthState.otpRequired) {
      Navigator.of(context).pop();
    }
  }

  String? _validatePhone(String? value) {
    if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(_normalizePhone(value ?? ''))) {
      return AppStrings.phoneValidation;
    }
    return null;
  }

  String? _validateEmail(String? value) {
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value?.trim() ?? '')) {
      return AppStrings.emailValidation;
    }
    return null;
  }

  String _normalizePhone(String value) {
    return value.trim().replaceAll(RegExp(r'[\s().-]'), '');
  }
}
