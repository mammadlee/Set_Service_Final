part of 'admin_home_shell.dart';

class _AdminAssignmentsTab extends StatefulWidget {
  const _AdminAssignmentsTab();

  @override
  State<_AdminAssignmentsTab> createState() => _AdminAssignmentsTabState();
}

class _AdminAssignmentsTabState extends State<_AdminAssignmentsTab> {
  late Future<AssignmentPage> _future;
  _AdminAssignmentFilter _filter = _AdminAssignmentFilter.all;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().listAssignments();
  }

  Future<void> _refresh() async {
    setState(() => _future = context.read<AdminRepository>().listAssignments());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    final canManageAssignments = context
        .watch<AdminAuthController>()
        .hasPermission('manage_assignments');
    return Scaffold(
      body: _AsyncView<AssignmentPage>(
        future: _future,
        onRetry: _refresh,
        builder: (page) {
          final assignments = _filterAssignments(page.data);
          if (page.data.isEmpty) {
            return _EmptyState(
              message: AppStrings.noAssignments,
              onAction: _refresh,
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                SizedBox(
                  width: double.infinity,
                  child: SegmentedButton<_AdminAssignmentFilter>(
                    expandedInsets: EdgeInsets.zero,
                    segments: const [
                      ButtonSegment(
                        value: _AdminAssignmentFilter.all,
                        label: Text(AppStrings.allJobs),
                      ),
                      ButtonSegment(
                        value: _AdminAssignmentFilter.history,
                        label: Text(AppStrings.assignmentHistory),
                      ),
                    ],
                    selected: {_filter},
                    onSelectionChanged: (value) =>
                        setState(() => _filter = value.first),
                  ),
                ),
                const SizedBox(height: 12),
                if (assignments.isEmpty)
                  const InlineMessage(message: AppStrings.noAssignments)
                else
                  ...assignments.map(
                    (assignment) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _AssignmentCard(
                        assignment,
                        canManageAssignments: canManageAssignments,
                        onChanged: _refresh,
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
      floatingActionButton: canManageAssignments
          ? FloatingActionButton.extended(
              onPressed: () async {
                final created = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                    builder: (_) => const _CreateAssignmentScreen(),
                  ),
                );
                if (created == true) {
                  _refresh();
                }
              },
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text(AppStrings.assignWorker),
            )
          : null,
    );
  }

  List<Assignment> _filterAssignments(List<Assignment> assignments) {
    final now = DateTime.now();
    return switch (_filter) {
      _AdminAssignmentFilter.all => assignments,
      _AdminAssignmentFilter.history =>
        assignments
            .where(
              (assignment) =>
                  assignment.status == 'completed' ||
                  assignment.status == 'cancelled' ||
                  assignment.status == 'rejected' ||
                  (assignment.order.endDatetime != null &&
                      assignment.order.endDatetime!.isBefore(now)),
            )
            .toList(),
    };
  }
}

enum _AdminAssignmentFilter { all, history }

class _CreateAssignmentScreen extends StatefulWidget {
  const _CreateAssignmentScreen();

  @override
  State<_CreateAssignmentScreen> createState() =>
      _CreateAssignmentScreenState();
}

class _CreateAssignmentScreenState extends State<_CreateAssignmentScreen> {
  late Future<_AssignmentOptions> _future;
  String? _orderId;
  String? _orderCategoryItemId;
  String? _workerId;
  bool _selectedOrderHasCategoryItems = false;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_AssignmentOptions> _load() async {
    final repo = context.read<AdminRepository>();
    final ordersFuture = repo.listOrders(status: 'active');
    final workersFuture = repo.listWorkers(status: 'approved', available: true);
    final orders = await ordersFuture;
    final workers = await workersFuture;
    return _AssignmentOptions(orders: orders.data, workers: workers.data);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.assignWorker)),
      body: _AdminBackdrop(
        child: _AsyncView<_AssignmentOptions>(
          future: _future,
          onRetry: () async {
            setState(() => _future = _load());
            await _future;
          },
          builder: (data) {
            final selectedOrder = _findOrderById(data.orders, _orderId);
            final categoryItems = selectedOrder?.categoryItems ?? const [];
            final assignableCategoryItems = categoryItems
                .where((item) => item.id != null && item.remainingCount > 0)
                .toList(growable: false);

            return ConstrainedPage(
              child: ListView(
                children: [
                  if (_error != null) ...[
                    InlineMessage(
                      message: _error!,
                      kind: InlineMessageKind.error,
                    ),
                    const SizedBox(height: 12),
                  ],
                  _AdminSelectorTile(
                    label: AppStrings.selectOrder,
                    value: selectedOrder?.title,
                    placeholder: 'Sifarişi seç',
                    onTap: data.orders.isEmpty
                        ? null
                        : () async {
                            final value =
                                await _showAdminOptionSheet<MobileOrder>(
                                  context: context,
                                  title: AppStrings.selectOrder,
                                  items: data.orders,
                                  label: (item) => item.title,
                                  icon: Icons.receipt_long_outlined,
                                );
                            if (value == null || !mounted) return;
                            setState(() {
                              _orderId = value.id;
                              _selectedOrderHasCategoryItems =
                                  value.categoryItems.isNotEmpty;
                              final assignableItems = value.categoryItems
                                  .where(
                                    (item) =>
                                        item.id != null &&
                                        item.remainingCount > 0,
                                  )
                                  .toList(growable: false);
                              _orderCategoryItemId = assignableItems.isNotEmpty
                                  ? assignableItems.first.id
                                  : null;
                            });
                          },
                  ),
                  if (categoryItems.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    if (assignableCategoryItems.isEmpty)
                      const InlineMessage(message: AppStrings.noAssignments)
                    else
                      _AdminSelectorTile(
                        label: AppStrings.selectCategory,
                        value: _findCategoryItemById(
                          assignableCategoryItems,
                          _orderCategoryItemId,
                        )?.category,
                        placeholder: AppStrings.selectCategory,
                        onTap: () async {
                          final value =
                              await _showAdminOptionSheet<
                                MobileOrderCategoryItem
                              >(
                                context: context,
                                title: AppStrings.selectCategory,
                                items: assignableCategoryItems,
                                label: (item) =>
                                    '${item.category} · ${AppStrings.remainingNeeded}: ${item.remainingCount}',
                                icon: Icons.room_service_outlined,
                              );
                          if (value?.id == null || !mounted) return;
                          setState(() => _orderCategoryItemId = value!.id);
                        },
                      ),
                  ],
                  const SizedBox(height: 12),
                  _AdminSelectorTile(
                    label: AppStrings.selectWorker,
                    value: _findWorkerById(data.workers, _workerId)?.name,
                    placeholder: 'İşçi seçin',
                    onTap: data.workers.isEmpty
                        ? null
                        : () async {
                            final value = await _showWorkerPickerSheet(
                              context,
                              data.workers,
                            );
                            if (value == null || !mounted) return;
                            setState(() => _workerId = value.id);
                          },
                  ),
                  const SizedBox(height: 18),
                  LoadingButton(
                    label: AppStrings.assignWorker,
                    icon: Icons.person_add_alt_1,
                    loading: _loading,
                    onPressed: _submit,
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_orderId == null ||
        _workerId == null ||
        (_selectedOrderHasCategoryItems && _orderCategoryItemId == null)) {
      setState(() => _error = AppStrings.requiredField);
      return;
    }
    final confirmed = await _confirmAction(
      context,
      AppStrings.assignWorkerConfirm,
    );
    if (!confirmed || !mounted) {
      return;
    }
    final repo = context.read<AdminRepository>();
    final navigator = Navigator.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await repo.createAssignment(
        orderId: _orderId!,
        workerId: _workerId!,
        orderCategoryItemId: _orderCategoryItemId,
      );
      if (mounted) {
        navigator.pop(true);
      }
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
}

class _AdminSelectorTile extends StatelessWidget {
  const _AdminSelectorTile({
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
    final enabled = onTap != null;
    return Material(
      color: BrandColors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: InputDecorator(
          isEmpty: displayValue.isEmpty,
          decoration: InputDecoration(
            labelText: label,
            contentPadding: const EdgeInsets.fromLTRB(24, 22, 18, 22),
            filled: true,
            fillColor: BrandColors.cardCream,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(32),
              borderSide: const BorderSide(color: BrandColors.accentGold),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(32),
              borderSide: const BorderSide(color: BrandColors.accentGold),
            ),
            suffixIcon: Icon(
              Icons.arrow_drop_down_rounded,
              size: 34,
              color: enabled ? BrandColors.darkText : BrandColors.urbanGraphite,
            ),
          ),
          child: Text(
            displayValue.isEmpty ? placeholder : displayValue,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: displayValue.isEmpty
                  ? BrandColors.urbanGraphite
                  : BrandColors.darkText,
              fontWeight: FontWeight.w700,
              fontSize: 19,
            ),
          ),
        ),
      ),
    );
  }
}

Future<T?> _showAdminOptionSheet<T>({
  required BuildContext context,
  required String title,
  required List<T> items,
  required String Function(T item) label,
  required IconData icon,
}) {
  return showPremiumBottomSheet<T>(
    context: context,
    title: title,
    child: SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.48,
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

Future<AdminWorkerProfile?> _showWorkerPickerSheet(
  BuildContext context,
  List<AdminWorkerProfile> workers,
) {
  return showPremiumBottomSheet<AdminWorkerProfile>(
    context: context,
    title: AppStrings.selectWorker,
    child: SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.56,
      child: ListView.separated(
        itemCount: workers.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final worker = workers[index];
          return PremiumCard(
            padding: const EdgeInsets.all(14),
            onTap: () => Navigator.of(context).pop(worker),
            child: _AdminWorkerAssignmentPickerItem(worker: worker),
          );
        },
      ),
    ),
  );
}

class _AdminWorkerAssignmentPickerItem extends StatelessWidget {
  const _AdminWorkerAssignmentPickerItem({required this.worker});

  final AdminWorkerProfile worker;

  @override
  Widget build(BuildContext context) {
    final position = worker.position.trim().isEmpty
        ? 'Qeyd edilməyib'
        : worker.position.trim();
    final rating = worker.ratingCount == 0
        ? 'Yoxdur'
        : '${worker.ratingAverage.toStringAsFixed(1)} ★';
    final workerClass = worker.workerClass?.trim().isEmpty == false
        ? worker.workerClass!
        : 'Təyin edilməyib';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  worker.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              if (worker.isFocTraining) ...[
                const SizedBox(width: 8),
                const PremiumChip(label: 'F.O.C. Təlim'),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Vəzifə: $position',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: BrandColors.urbanGraphite,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 3),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              Text(
                'Reytinq: $rating',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: BrandColors.urbanGraphite,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                'Sinif: $workerClass',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: BrandColors.urbanGraphite,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

Future<String?> _askReason(BuildContext context) async {
  final controller = TextEditingController();
  try {
    return await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(AppStrings.rejectionReason),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: AppStrings.rejectionReason,
          ),
          minLines: 2,
          maxLines: 4,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text(AppStrings.close),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text(AppStrings.confirm),
          ),
        ],
      ),
    );
  } finally {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    controller.dispose();
  }
}

Future<bool> _confirmAction(BuildContext context, String message) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text(AppStrings.confirmActionTitle),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text(AppStrings.cancel),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text(AppStrings.confirm),
        ),
      ],
    ),
  );
  return result ?? false;
}

class _AssignmentCard extends StatelessWidget {
  const _AssignmentCard(
    this.assignment, {
    required this.canManageAssignments,
    required this.onChanged,
  });

  final Assignment assignment;
  final bool canManageAssignments;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final statusHelp = AppStrings.assignmentStatusHelp(assignment.status);
    return PremiumCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  assignment.order.title,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.black,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              StatusPill(status: assignment.status),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            assignment.worker.name,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (statusHelp != null) ...[
            const SizedBox(height: 10),
            InlineMessage(message: statusHelp),
          ],
          if (assignment.status == 'accepted') ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.tablet_mac_outlined),
                label: const Text('QR ekranı'),
                onPressed: () => _showKioskInfo(context),
              ),
            ),
          ],
          if (canManageAssignments && assignment.status != 'completed') ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.cancel_outlined),
                label: const Text(AppStrings.cancel),
                onPressed: () async {
                  final confirmed = await _confirmAction(
                    context,
                    AppStrings.cancelAssignmentConfirm,
                  );
                  if (!confirmed || !context.mounted) {
                    return;
                  }
                  await context.read<AdminRepository>().cancelAssignment(
                    assignment.id,
                  );
                  await onChanged();
                },
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _showKioskInfo(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (_) => const AlertDialog(
        title: Text('QR kiosk idarəetməsi'),
        content: Text(
          'Venue kiosk linkləri admin panelində sifariş/növbə əsasında aktiv edilir. Mobil admin kartı işçi təyinatını idarə etmək üçün saxlanılıb.',
        ),
      ),
    );
  }

  // ignore: unused_element
  Future<void> _createKiosk(BuildContext context) async {
    try {
      final kiosk = await context.read<AdminRepository>().createKioskSession(
        assignment.id,
      );
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('QR ekranı'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Bu linki tərəfdaş məkanın tablet brauzerində açın.'),
              const SizedBox(height: 10),
              SelectableText(kiosk.kioskUrl),
              const SizedBox(height: 10),
              Text(
                'QR hər ${kiosk.refreshIntervalSeconds} saniyədən bir yenilənir.',
              ),
            ],
          ),
          actions: [
            TextButton.icon(
              onPressed: () => _openKioskUrl(dialogContext, kiosk.kioskUrl),
              icon: const Icon(Icons.open_in_new),
              label: const Text('QR ekranını aç'),
            ),
            TextButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: kiosk.kioskUrl));
                if (!dialogContext.mounted) return;
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  const SnackBar(content: Text('QR linki kopyalandı.')),
                );
              },
              icon: const Icon(Icons.copy_outlined),
              label: const Text('QR linkini kopyala'),
            ),
            TextButton.icon(
              onPressed: () async {
                await context.read<AdminRepository>().revokeKioskSession(
                  kiosk.id,
                );
                if (!dialogContext.mounted) return;
                Navigator.of(dialogContext).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('QR ekranı deaktiv edildi.')),
                );
              },
              icon: const Icon(Icons.block_outlined),
              label: const Text('Deaktiv et'),
            ),
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text(AppStrings.close),
            ),
          ],
        ),
      );
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _openKioskUrl(BuildContext context, String url) async {
    if (!KioskUrlPolicy.isAllowed(url)) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(AppStrings.kioskUrlBlocked)));
      return;
    }

    final uri = Uri.parse(url.trim());
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('QR linkini açmaq mümkün olmadı.')),
      );
    }
  }
}
