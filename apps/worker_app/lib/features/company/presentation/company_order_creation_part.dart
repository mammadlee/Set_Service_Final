part of 'company_home_shell.dart';

class _CreateOrderScreen extends StatefulWidget {
  const _CreateOrderScreen();

  @override
  State<_CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<_CreateOrderScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _start = TextEditingController();
  final _end = TextEditingController();
  final _location = TextEditingController();
  final List<_CategoryDraft> _categories = [_CategoryDraft()];
  List<TaxonomyDepartment> _taxonomy = const [];
  DateTime? _startDateTime;
  DateTime? _endDateTime;
  int _stepIndex = 0;
  int _activeCategoryIndex = 0;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTaxonomy();
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _start.dispose();
    _end.dispose();
    _location.dispose();
    for (final category in _categories) {
      category.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeIndex = _activeCategoryIndex >= _categories.length
        ? _categories.length - 1
        : _activeCategoryIndex;
    final draft = _categories[activeIndex];
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.createOrder)),
      body: ConstrainedPage(
        showBackdrop: true,
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              if (_error != null) ...[
                InlineMessage(message: _error!, kind: InlineMessageKind.error),
                const SizedBox(height: 12),
              ],
              _OrderStepHeader(stepIndex: _stepIndex),
              const SizedBox(height: 40),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _stepTitle(_stepIndex),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 22),
                  _stepContent(draft),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      if (_stepIndex > 0)
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _loading
                                ? null
                                : () => setState(() => _stepIndex -= 1),
                            icon: const Icon(Icons.arrow_back_outlined),
                            label: const Text('Geri'),
                          ),
                        ),
                      if (_stepIndex > 0) const SizedBox(width: 10),
                      Expanded(
                        child: LoadingButton(
                          label: _stepIndex == 6 ? AppStrings.save : 'Davam et',
                          icon: _stepIndex == 6
                              ? Icons.save_outlined
                              : Icons.arrow_forward_outlined,
                          loading: _loading,
                          onPressed: _canContinue(draft)
                              ? (_stepIndex == 6
                                    ? _submit
                                    : () => setState(() => _stepIndex += 1))
                              : null,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _stepTitle(int step) {
    return switch (step) {
      0 => 'Şöbə',
      1 => 'Departament',
      2 => 'Vəzifə',
      3 => 'İşçi sayı',
      4 => 'Tarix və saat',
      5 => 'Ünvan',
      _ => 'Yekun təsdiq',
    };
  }

  bool _canContinue(_CategoryDraft draft) {
    return switch (_stepIndex) {
      0 => draft.departmentId != null,
      1 => draft.subdepartmentId != null,
      2 => draft.positionId != null,
      3 => draft.count > 0,
      4 => _startDateTime != null && _endDateTime != null,
      5 => _location.text.trim().length >= 2,
      _ => true,
    };
  }

  Widget _stepContent(_CategoryDraft draft) {
    return switch (_stepIndex) {
      0 => _DepartmentStep(
        draft: draft,
        taxonomy: _taxonomy,
        onChanged: () => setState(() {}),
      ),
      1 => _SubdepartmentStep(
        draft: draft,
        taxonomy: _taxonomy,
        onChanged: () => setState(() {}),
      ),
      2 => _PositionStep(
        draft: draft,
        taxonomy: _taxonomy,
        onChanged: () => setState(() {}),
      ),
      3 => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _QuantitySelector(
            value: draft.count,
            onChanged: (value) {
              draft.count = value;
              setState(() {});
            },
          ),
          _Field(
            controller: draft.notes,
            label: AppStrings.categoryNotes,
            required: false,
          ),
        ],
      ),
      4 => Column(
        children: [
          _DateTimeField(
            controller: _start,
            label: AppStrings.starts,
            onTap: () => _pickDateTime(isStart: true),
          ),
          _DateTimeField(
            controller: _end,
            label: AppStrings.ends,
            onTap: () => _pickDateTime(isStart: false),
          ),
        ],
      ),
      5 => _Field(
        controller: _location,
        label: AppStrings.location,
        min: 2,
        onChanged: (_) => setState(() => _error = null),
      ),
      _ => _OrderSummaryStep(
        title: _title,
        description: _description,
        categories: _categories,
        taxonomy: _taxonomy,
        onChanged: () => setState(() => _error = null),
        onAddCategory: _addCategory,
        onRemoveCategory: _removeCategory,
      ),
    };
  }

  Future<void> _submit() async {
    if (_loading) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final start = _startDateTime;
    final end = _endDateTime;
    if (start == null) {
      setState(() => _error = AppStrings.dateRequired);
      return;
    }
    if (start.isBefore(DateTime.now())) {
      setState(() => _error = AppStrings.startDateFuture);
      return;
    }
    if (end == null) {
      setState(() => _error = AppStrings.dateRequired);
      return;
    }
    if (!end.isAfter(start)) {
      setState(() => _error = AppStrings.endDateAfterStart);
      return;
    }
    final positionIds = <String>{};
    for (final category in _categories) {
      if (category.positionId == null) {
        setState(() => _error = 'Şöbə, departament və vəzifə seçilməlidir.');
        return;
      }
      if (positionIds.contains(category.positionId)) {
        setState(() => _error = AppStrings.duplicateCategory);
        return;
      }
      positionIds.add(category.positionId!);
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = context.read<CompanyRepository>();
      final navigator = Navigator.of(context);
      await repo.createOrder(
        title: _title.text.trim(),
        description: _description.text.trim(),
        categoryItems: _categories
            .map(
              (category) => CreateOrderCategoryInput(
                category: category.category.trim(),
                departmentId: category.departmentId!,
                subdepartmentId: category.subdepartmentId!,
                positionId: category.positionId!,
                requiredCount: category.count,
                notes: category.notes.text.trim().isEmpty
                    ? null
                    : category.notes.text.trim(),
              ),
            )
            .toList(),
        start: start,
        end: end,
        location: _location.text.trim(),
      );
      if (mounted) navigator.pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = AppStrings.actionFailed);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadTaxonomy() async {
    try {
      final taxonomy = await context.read<TaxonomyRepository>().list();
      if (!mounted) return;
      setState(() => _taxonomy = taxonomy);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Vəzifələr yüklənmədi.');
    }
  }

  void _addCategory() {
    setState(() {
      _categories.add(_CategoryDraft());
      _activeCategoryIndex = _categories.length - 1;
      _stepIndex = 0;
    });
  }

  void _removeCategory(int index) {
    if (_categories.length <= 1) return;
    late final _CategoryDraft removed;
    setState(() {
      removed = _categories.removeAt(index);
      if (_activeCategoryIndex >= _categories.length) {
        _activeCategoryIndex = _categories.length - 1;
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => removed.dispose());
  }

  Future<void> _pickDateTime({required bool isStart}) async {
    final now = DateTime.now();
    final current = isStart ? _startDateTime : _endDateTime;
    final initial = current ?? now.add(const Duration(hours: 2));
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null) return;
    final picked = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    if (!mounted) return;
    setState(() {
      if (isStart) {
        _startDateTime = picked;
        _start.text = _dateTimeLabel(picked);
      } else {
        _endDateTime = picked;
        _end.text = _dateTimeLabel(picked);
      }
      _error = null;
    });
  }

  String _dateTimeLabel(DateTime value) {
    return DateFormat('dd.MM.yyyy, HH:mm').format(value);
  }
}

/*
const _orderCategoryOptions = [
  'Ofisiant',
  'Aşpaz köməkçisi',
  'Barmen',
  'Hostes',
  'Otaq təmizləyicisi',
  'Qabyuyan',
  'Servis köməkçisi',
  'Barmen köməkçisi',
];
*/

class _CategoryDraft {
  String category = '';
  String? departmentId;
  String? subdepartmentId;
  String? positionId;
  int count = 1;
  final notes = TextEditingController();

  void dispose() {
    notes.dispose();
  }
}

List<TaxonomySubdepartment> _subdepartmentsFor(
  List<TaxonomyDepartment> departments,
  String? departmentId,
) {
  for (final department in departments) {
    if (department.id == departmentId) return department.subdepartments;
  }
  return const [];
}

List<TaxonomyPosition> _positionsFor(
  List<TaxonomyDepartment> departments,
  String? departmentId,
  String? subdepartmentId,
) {
  for (final subdepartment in _subdepartmentsFor(departments, departmentId)) {
    if (subdepartment.id == subdepartmentId) return subdepartment.positions;
  }
  return const [];
}

TaxonomyPosition? _findPosition(
  List<TaxonomyDepartment> departments,
  String? positionId,
) {
  for (final department in departments) {
    for (final subdepartment in department.subdepartments) {
      for (final position in subdepartment.positions) {
        if (position.id == positionId) return position;
      }
    }
  }
  return null;
}

TaxonomyDepartment? _findDepartment(
  List<TaxonomyDepartment> departments,
  String? departmentId,
) {
  for (final department in departments) {
    if (department.id == departmentId) return department;
  }
  return null;
}

TaxonomySubdepartment? _findSubdepartment(
  List<TaxonomySubdepartment> subdepartments,
  String? subdepartmentId,
) {
  for (final subdepartment in subdepartments) {
    if (subdepartment.id == subdepartmentId) return subdepartment;
  }
  return null;
}

Future<T?> _showOrderOptionSheet<T>({
  required BuildContext context,
  required String title,
  required List<T> items,
  required String Function(T item) label,
}) {
  return showPremiumBottomSheet<T>(
    context: context,
    title: title,
    child: SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.52,
      child: items.isEmpty
          ? const InlineMessage(message: 'Seçim tapılmadı.')
          : ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                return ListTile(
                  minVerticalPadding: 14,
                  onTap: () => Navigator.of(context).pop(item),
                  title: Text(
                    label(item),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                );
              },
            ),
    ),
  );
}

class _OrderSelectorTile extends StatelessWidget {
  const _OrderSelectorTile({
    required this.label,
    required this.placeholder,
    required this.onTap,
    this.value,
  });

  final String label;
  final String placeholder;
  final VoidCallback? onTap;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final displayValue = value?.trim() ?? '';
    return Material(
      color: BrandColors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(32),
        onTap: onTap,
        child: InputDecorator(
          isEmpty: displayValue.isEmpty,
          decoration: InputDecoration(
            labelText: label,
            suffixIcon: Icon(
              Icons.keyboard_arrow_down_rounded,
              color: BrandColors.darkText,
            ),
          ),
          child: Text(
            displayValue.isEmpty ? placeholder : displayValue,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: displayValue.isEmpty
                  ? BrandColors.mutedBrown
                  : BrandColors.darkText,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _OrderStepHeader extends StatelessWidget {
  const _OrderStepHeader({required this.stepIndex});

  final int stepIndex;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: List.generate(7, (index) {
          final active = index == stepIndex;
          return Expanded(
            child: Container(
              height: 9,
              margin: EdgeInsets.only(right: index == 6 ? 0 : 6),
              decoration: BoxDecoration(
                color: active
                    ? BrandColors.primaryBurgundy
                    : const Color(0xFFD7D4CF),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _DepartmentStep extends StatelessWidget {
  const _DepartmentStep({
    required this.draft,
    required this.taxonomy,
    required this.onChanged,
  });

  final _CategoryDraft draft;
  final List<TaxonomyDepartment> taxonomy;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final selected = _findDepartment(taxonomy, draft.departmentId);
    return _OrderSelectorTile(
      label: 'Şöbə',
      value: selected?.nameAz,
      placeholder: taxonomy.isEmpty ? 'Şöbə tapılmadı' : 'Şöbə seçin',
      onTap: taxonomy.isEmpty
          ? null
          : () async {
              final value = await _showOrderOptionSheet<TaxonomyDepartment>(
                context: context,
                title: 'Şöbə seçin',
                items: taxonomy,
                label: (item) => item.nameAz,
              );
              if (value == null) return;
              draft.departmentId = value.id;
              draft.subdepartmentId = null;
              draft.positionId = null;
              draft.category = '';
              onChanged();
            },
    );
  }
}

class _SubdepartmentStep extends StatelessWidget {
  const _SubdepartmentStep({
    required this.draft,
    required this.taxonomy,
    required this.onChanged,
  });

  final _CategoryDraft draft;
  final List<TaxonomyDepartment> taxonomy;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final items = _subdepartmentsFor(taxonomy, draft.departmentId);
    final selected = _findSubdepartment(items, draft.subdepartmentId);
    return _OrderSelectorTile(
      label: 'Departament',
      value: selected?.nameAz,
      placeholder: draft.departmentId == null
          ? 'Əvvəlcə şöbə seç'
          : 'Departament seç',
      onTap: draft.departmentId == null
          ? null
          : () async {
              final value = await _showOrderOptionSheet<TaxonomySubdepartment>(
                context: context,
                title: 'Departament seçin',
                items: items,
                label: (item) => item.nameAz,
              );
              if (value == null) return;
              draft.subdepartmentId = value.id;
              draft.positionId = null;
              draft.category = '';
              onChanged();
            },
    );
  }
}

class _PositionStep extends StatelessWidget {
  const _PositionStep({
    required this.draft,
    required this.taxonomy,
    required this.onChanged,
  });

  final _CategoryDraft draft;
  final List<TaxonomyDepartment> taxonomy;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final items = _positionsFor(
      taxonomy,
      draft.departmentId,
      draft.subdepartmentId,
    );
    final selected = _findPosition(taxonomy, draft.positionId);
    return _OrderSelectorTile(
      label: 'Vəzifə',
      value: selected?.nameAz,
      placeholder: draft.subdepartmentId == null
          ? 'Əvvəlcə departament seç'
          : 'Vəzifə seç',
      onTap: draft.subdepartmentId == null
          ? null
          : () async {
              final value = await _showOrderOptionSheet<TaxonomyPosition>(
                context: context,
                title: 'Vəzifə seçin',
                items: items,
                label: (item) => item.nameAz,
              );
              if (value == null) return;
              draft.positionId = value.id;
              draft.category = value.nameAz;
              onChanged();
            },
    );
  }
}

class _OrderSummaryStep extends StatelessWidget {
  const _OrderSummaryStep({
    required this.title,
    required this.description,
    required this.categories,
    required this.taxonomy,
    required this.onChanged,
    required this.onAddCategory,
    required this.onRemoveCategory,
  });

  final TextEditingController title;
  final TextEditingController description;
  final List<_CategoryDraft> categories;
  final List<TaxonomyDepartment> taxonomy;
  final VoidCallback onChanged;
  final VoidCallback onAddCategory;
  final ValueChanged<int> onRemoveCategory;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Field(
          controller: title,
          label: AppStrings.orderTitle,
          min: 3,
          onChanged: (_) => onChanged(),
        ),
        _Field(
          controller: description,
          label: AppStrings.description,
          min: 10,
          maxLines: 3,
          onChanged: (_) => onChanged(),
        ),
        const SizedBox(height: 6),
        ...categories.asMap().entries.map((entry) {
          final draft = entry.value;
          final position = _findPosition(taxonomy, draft.positionId);
          return ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.room_service_outlined),
            title: Text(
              position?.nameAz ?? draft.category,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text('${AppStrings.requiredWorkers}: ${draft.count}'),
            trailing: categories.length > 1
                ? IconButton(
                    onPressed: () => onRemoveCategory(entry.key),
                    icon: const Icon(Icons.close),
                  )
                : null,
          );
        }),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: onAddCategory,
          icon: const Icon(Icons.add),
          label: const Text(AppStrings.addCategory),
        ),
      ],
    );
  }
}

class _QuantitySelector extends StatelessWidget {
  const _QuantitySelector({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              AppStrings.requiredWorkers,
              style: Theme.of(
                context,
              ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          IconButton.filledTonal(
            onPressed: value > 1 ? () => onChanged(value - 1) : null,
            icon: const Icon(Icons.remove),
          ),
          SizedBox(
            width: 48,
            child: Center(
              child: Text(
                '$value',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          ),
          IconButton.filledTonal(
            onPressed: value < 500 ? () => onChanged(value + 1) : null,
            icon: const Icon(Icons.add),
          ),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    this.min = 1,
    this.required = true,
    this.maxLines = 1,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final int min;
  final bool required;
  final int maxLines;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        maxLines: maxLines,
        onChanged: onChanged,
        decoration: InputDecoration(labelText: label),
        validator: (value) {
          final text = value?.trim() ?? '';
          if (!required && text.isEmpty) return null;
          if (text.length < min) return AppStrings.requiredField;
          return null;
        },
      ),
    );
  }
}

class _DateTimeField extends StatelessWidget {
  const _DateTimeField({
    required this.controller,
    required this.label,
    required this.onTap,
  });

  final TextEditingController controller;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        readOnly: true,
        onTap: onTap,
        decoration: InputDecoration(
          labelText: label,
          hintText: AppStrings.dateRequired,
          prefixIcon: const Icon(Icons.hourglass_bottom_rounded),
          suffixIcon: const Icon(Icons.expand_more),
        ),
        validator: (value) {
          final text = value?.trim() ?? '';
          if (text.isEmpty) {
            return AppStrings.dateRequired;
          }
          return null;
        },
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, this.onTap});

  final MobileOrder order;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Premium3DCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(22, 22, 18, 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 170),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    order.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                StatusPill(status: order.status),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              _orderCategorySummary(order),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Text(
              '${AppStrings.requiredWorkers}: ${order.assignmentCount}/${order.requiredCount}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (order.location.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                order.location,
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: BrandColors.mutedBrown),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

String _orderCategorySummary(MobileOrder order) {
  if (order.categoryItems.isEmpty) {
    return '${order.category} (${order.requiredCount})';
  }
  return order.categoryItems
      .map(
        (item) =>
            '${item.category} (${item.assignedCount}/${item.requiredCount})',
      )
      .join(', ');
}
