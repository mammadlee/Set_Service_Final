import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../../taxonomy/data/taxonomy_repository.dart';
import '../controllers/auth_controller.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController(text: '+994');
  List<TaxonomyDepartment> _departments = const [];
  List<String> _skills = const [];
  List<String> _languages = const ['Azərbaycan dili'];
  String? _departmentId;
  String? _subdepartmentId;
  String? _positionId;
  bool _taxonomyLoading = true;
  String? _taxonomyError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<AuthController>().clearTransientMessages();
    });
    _loadTaxonomy();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final viewInsets = MediaQuery.viewInsetsOf(context);

    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: const Text(
          AppStrings.registerTitle,
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
            padding: EdgeInsets.only(bottom: viewInsets.bottom + 28),
            children: [
              Text(
                'Hesab yarat',
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: BrandColors.darkText,
                  fontWeight: FontWeight.w800,
                  height: 1.12,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Telefon təsdiqindən sonra şifrə yaradın və profiliniz admin təsdiqinə göndəriləcək.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: BrandColors.darkText,
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
                controller: _nameController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: AppStrings.fullName,
                  floatingLabelBehavior: FloatingLabelBehavior.auto,
                  prefixIcon: Icon(Icons.badge_outlined),
                ),
                validator: (value) =>
                    _min(value, 2, AppStrings.fullNameRequired),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: AppStrings.phoneNumber,
                  hintText: AppStrings.phoneHint,
                  floatingLabelBehavior: FloatingLabelBehavior.auto,
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
                validator: _validatePhone,
              ),
              const SizedBox(height: 14),
              if (_taxonomyError != null) ...[
                InlineMessage(
                  message: _taxonomyError!,
                  kind: InlineMessageKind.error,
                ),
                const SizedBox(height: 14),
              ],
              _SelectorField(
                label: 'Şöbə',
                value: _selectedDepartment?.nameAz,
                placeholder: 'Şöbə seçin',
                icon: Icons.business_center_outlined,
                requiredMessage: AppStrings.positionRequired,
                onTap: _taxonomyLoading ? null : _selectDepartment,
              ),
              if (_departmentId != null) ...[
                const SizedBox(height: 14),
                _SelectorField(
                  label: 'Departament',
                  value: _selectedSubdepartment?.nameAz,
                  placeholder: 'Departament seçin',
                  icon: Icons.account_tree_outlined,
                  requiredMessage: AppStrings.positionRequired,
                  onTap: _selectSubdepartment,
                ),
              ],
              if (_subdepartmentId != null) ...[
                const SizedBox(height: 14),
                _SelectorField(
                  label: 'Vəzifə',
                  value: _selectedPosition?.nameAz,
                  placeholder: 'Vəzifə seçin',
                  icon: Icons.work_outline,
                  requiredMessage: AppStrings.positionRequired,
                  onTap: _selectPosition,
                ),
              ],
              const SizedBox(height: 14),
              _SelectorField(
                label: AppStrings.skills,
                value: _skills.isEmpty
                    ? null
                    : '${_skills.length} bacarıq seçilib',
                placeholder: AppStrings.skillsHint,
                icon: Icons.task_alt_outlined,
                onTap: _selectSkills,
              ),
              const SizedBox(height: 14),
              _SelectorField(
                label: AppStrings.languages,
                value: _languages.isEmpty ? null : _languages.join(', '),
                placeholder: AppStrings.languagesHint,
                icon: Icons.translate_outlined,
                onTap: _selectLanguages,
              ),
              const SizedBox(height: 22),
              LoadingButton(
                label: AppStrings.registerAndSendOtp,
                icon: Icons.sms_outlined,
                loading: auth.isSubmitting,
                onPressed: () => _submit(context),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit(BuildContext context) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final position = _selectedPosition;
    if (position == null) return;

    await context.read<AuthController>().registerWorker(
      fullName: _nameController.text.trim(),
      phone: _phoneController.text.trim(),
      position: position.nameAz,
      positionIds: [position.id],
      skills: _skills,
      languages: _languages,
    );

    if (!context.mounted) return;
    if (context.read<AuthController>().state == AuthViewState.otpRequired) {
      Navigator.of(context).pop();
    }
  }

  String? _min(String? value, int min, String message) {
    if ((value ?? '').trim().length < min) return message;
    return null;
  }

  String? _validatePhone(String? value) {
    final phone = value?.trim() ?? '';
    if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(phone)) {
      return AppStrings.phoneValidation;
    }
    return null;
  }

  Future<void> _selectDepartment() async {
    final selected = await _showOptionSheet<TaxonomyDepartment>(
      title: 'Şöbə seçin',
      items: _departments,
      label: (item) => item.nameAz,
      icon: Icons.business_center_outlined,
    );
    if (selected == null || !mounted) return;
    setState(() {
      _departmentId = selected.id;
      _subdepartmentId = null;
      _positionId = null;
    });
    _formKey.currentState?.validate();
  }

  Future<void> _selectSubdepartment() async {
    final selected = await _showOptionSheet<TaxonomySubdepartment>(
      title: 'Departament seçin',
      items: _selectedDepartment?.subdepartments ?? const [],
      label: (item) => item.nameAz,
      icon: Icons.account_tree_outlined,
    );
    if (selected == null || !mounted) return;
    setState(() {
      _subdepartmentId = selected.id;
      _positionId = null;
    });
    _formKey.currentState?.validate();
  }

  Future<void> _selectPosition() async {
    final selected = await _showOptionSheet<TaxonomyPosition>(
      title: 'Vəzifə seçin',
      items: _selectedSubdepartment?.positions ?? const [],
      label: (item) => item.nameAz,
      icon: Icons.work_outline,
    );
    if (selected == null || !mounted) return;
    setState(() => _positionId = selected.id);
    _formKey.currentState?.validate();
  }

  Future<void> _selectSkills() async {
    final result = await _showChipSheet(
      title: AppStrings.skills,
      options: _skillOptions,
      selected: _skills,
      allowCustom: true,
    );
    if (result == null || !mounted) return;
    setState(() => _skills = result);
  }

  Future<void> _selectLanguages() async {
    final result = await _showChipSheet(
      title: AppStrings.languages,
      options: _languageOptions,
      selected: _languages,
    );
    if (result == null || !mounted) return;
    setState(() => _languages = result);
  }

  Future<T?> _showOptionSheet<T>({
    required String title,
    required List<T> items,
    required String Function(T item) label,
    required IconData icon,
  }) {
    return showPremiumBottomSheet<T>(
      context: context,
      title: title,
      child: SizedBox(
        height: (MediaQuery.sizeOf(context).height * 0.44).clamp(250.0, 430.0),
        child: items.isEmpty
            ? const InlineMessage(message: 'Seçim tapılmadı.')
            : ListView.separated(
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final item = items[index];
                  return PremiumCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    onTap: () => Navigator.of(context).pop(item),
                    child: Row(
                      children: [
                        Icon(icon, color: BrandColors.primaryBurgundy),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            label(item),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        const Icon(
                          Icons.chevron_right_rounded,
                          color: BrandColors.urbanGraphite,
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }

  Future<List<String>?> _showChipSheet({
    required String title,
    required List<String> options,
    required List<String> selected,
    bool allowCustom = false,
  }) async {
    final customController = TextEditingController();
    var draft = [...selected];
    try {
      return await showPremiumBottomSheet<List<String>>(
        context: context,
        title: title,
        child: StatefulBuilder(
          builder: (context, setSheetState) {
            final allOptions = {
              ...options,
              ...draft.where((item) => !options.contains(item)),
            }.toList();
            final optionsHeight = (MediaQuery.sizeOf(context).height * 0.29)
                .clamp(190.0, 300.0);

            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: optionsHeight,
                  child: SingleChildScrollView(
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: allOptions
                          .map(
                            (item) => FilterChip(
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                              labelPadding: const EdgeInsets.symmetric(
                                horizontal: 6,
                              ),
                              label: Text(
                                item,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              selected: draft.contains(item),
                              onSelected: (_) => setSheetState(
                                () => draft = _toggle(draft, item),
                              ),
                            ),
                          )
                          .toList(growable: false),
                    ),
                  ),
                ),
                if (allowCustom) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: customController,
                    textInputAction: TextInputAction.done,
                    decoration: InputDecoration(
                      labelText: 'Yeni bacarıq əlavə et',
                      prefixIcon: const Icon(Icons.add_circle_outline),
                      suffixIcon: IconButton(
                        tooltip: 'Əlavə et',
                        onPressed: () => _addCustomSkill(
                          setSheetState,
                          customController,
                          (value) => draft = value,
                          draft,
                        ),
                        icon: const Icon(Icons.add_rounded),
                      ),
                    ),
                    onSubmitted: (_) => _addCustomSkill(
                      setSheetState,
                      customController,
                      (value) => draft = value,
                      draft,
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final narrow = constraints.maxWidth < 300;
                    if (narrow) {
                      return Column(
                        children: [
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton(
                              onPressed: () => Navigator.of(context).pop(),
                              child: const Text(AppStrings.cancel),
                            ),
                          ),
                          const SizedBox(height: 10),
                          LoadingButton(
                            label: AppStrings.save,
                            icon: Icons.check_rounded,
                            loading: false,
                            onPressed: () => Navigator.of(context).pop(draft),
                          ),
                        ],
                      );
                    }
                    return Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text(AppStrings.cancel),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: LoadingButton(
                            label: AppStrings.save,
                            icon: Icons.check_rounded,
                            loading: false,
                            onPressed: () => Navigator.of(context).pop(draft),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ],
            );
          },
        ),
      );
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 350));
      customController.dispose();
    }
  }

  void _addCustomSkill(
    StateSetter setSheetState,
    TextEditingController controller,
    ValueChanged<List<String>> updateDraft,
    List<String> currentDraft,
  ) {
    final value = controller.text.trim();
    if (value.isEmpty) return;
    final exists = currentDraft.any(
      (item) => item.toLowerCase() == value.toLowerCase(),
    );
    if (!exists) {
      setSheetState(() => updateDraft([...currentDraft, value]));
    }
    controller.clear();
  }

  List<String> _toggle(List<String> source, String value) {
    return source.contains(value)
        ? source.where((item) => item != value).toList(growable: false)
        : [...source, value];
  }

  Future<void> _loadTaxonomy() async {
    try {
      final departments = await context.read<TaxonomyRepository>().list();
      if (!mounted) return;
      setState(() {
        _departments = departments;
        _taxonomyLoading = false;
        _taxonomyError = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _taxonomyLoading = false;
        _taxonomyError = 'Vəzifələr yüklənmədi.';
      });
    }
  }

  TaxonomyDepartment? get _selectedDepartment {
    for (final department in _departments) {
      if (department.id == _departmentId) return department;
    }
    return null;
  }

  TaxonomySubdepartment? get _selectedSubdepartment {
    for (final subdepartment
        in _selectedDepartment?.subdepartments ?? const []) {
      if (subdepartment.id == _subdepartmentId) return subdepartment;
    }
    return null;
  }

  TaxonomyPosition? get _selectedPosition {
    for (final position in _selectedSubdepartment?.positions ?? const []) {
      if (position.id == _positionId) return position;
    }
    return null;
  }
}

class _SelectorField extends StatelessWidget {
  const _SelectorField({
    required this.label,
    required this.placeholder,
    required this.icon,
    required this.onTap,
    this.value,
    this.requiredMessage,
  });

  final String label;
  final String placeholder;
  final IconData icon;
  final VoidCallback? onTap;
  final String? value;
  final String? requiredMessage;

  @override
  Widget build(BuildContext context) {
    final displayValue = value?.trim() ?? '';

    return FormField<String>(
      validator: (_) {
        if (requiredMessage != null && displayValue.isEmpty) {
          return requiredMessage;
        }
        return null;
      },
      builder: (field) {
        final enabled = onTap != null;
        final borderColor = field.hasError
            ? BrandColors.error
            : BrandColors.accentGold;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 18, bottom: 7),
              child: Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: field.hasError
                      ? BrandColors.error
                      : BrandColors.urbanGraphite,
                  fontWeight: FontWeight.w600,
                  height: 1.2,
                ),
              ),
            ),
            Material(
              color: BrandColors.white.withValues(alpha: 0.88),
              borderRadius: BorderRadius.circular(28),
              child: InkWell(
                borderRadius: BorderRadius.circular(28),
                onTap: enabled ? onTap : null,
                child: Container(
                  width: double.infinity,
                  constraints: const BoxConstraints(minHeight: 64),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: borderColor),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        icon,
                        size: 25,
                        color: enabled
                            ? BrandColors.urbanGraphite
                            : BrandColors.urbanGraphite.withValues(alpha: 0.55),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          displayValue.isEmpty ? placeholder : displayValue,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            color: displayValue.isEmpty
                                ? BrandColors.urbanGraphite
                                : BrandColors.darkText,
                            fontWeight: FontWeight.w600,
                            height: 1.2,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: enabled
                            ? BrandColors.primaryBurgundy
                            : BrandColors.urbanGraphite,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (field.errorText != null) ...[
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                child: Text(
                  field.errorText!,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: BrandColors.error,
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

const _skillOptions = [
  'Qonaqlarla peşəkar ünsiyyət',
  'Müştəri məmnuniyyətinin təmin edilməsi',
  'Komanda ilə işləmək bacarığı',
  'Vaxtın idarə olunması',
  'Stress altında işləmə bacarığı',
  'Rezervasiya proseslərinin idarə olunması',
  'Housekeeping və otaq yoxlaması standartları',
  'Təhlükəsizlik və gigiyena standartları (HACCP, ISO)',
  'Kassa və POS sistemi ilə işləmək',
  'Səliqə, etik davranış və təqdimat bacarığı',
  'F&B xidmətləri haqqında bilik',
  'Növbəli iş rejiminə uyğunlaşma',
];

const _languageOptions = [
  'Azərbaycan dili',
  'İngilis dili',
  'Rus dili',
  'Türk dili',
  'Ərəb dili',
];
