part of 'company_home_shell.dart';

class _CompanyOrdersTab extends StatefulWidget {
  const _CompanyOrdersTab({required this.attendanceCache});

  final _CompanyAttendanceStatusCache attendanceCache;

  @override
  State<_CompanyOrdersTab> createState() => _CompanyOrdersTabState();
}

class _CompanyOrdersTabState extends State<_CompanyOrdersTab> {
  late Future<MobileOrderPage> _future;
  _OrderHistoryFilter _filter = _OrderHistoryFilter.active;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<MobileOrderPage> _load() =>
      context.read<CompanyRepository>().listOrders();

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BrandColors.transparent,
      body: _AsyncView<MobileOrderPage>(
        future: _future,
        onRetry: _refresh,
        builder: (page) {
          final visibleOrders = _filterOrders(page.data);
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
              children: [
                SizedBox(
                  width: double.infinity,
                  child: SegmentedButton<_OrderHistoryFilter>(
                    expandedInsets: EdgeInsets.zero,
                    segments: const [
                      ButtonSegment(
                        value: _OrderHistoryFilter.active,
                        label: Text(AppStrings.activeOrders),
                      ),
                      ButtonSegment(
                        value: _OrderHistoryFilter.past,
                        label: Text(AppStrings.pastOrders),
                      ),
                      ButtonSegment(
                        value: _OrderHistoryFilter.all,
                        label: Text(AppStrings.allOrders),
                      ),
                    ],
                    selected: {_filter},
                    onSelectionChanged: (value) =>
                        setState(() => _filter = value.first),
                  ),
                ),
                const SizedBox(height: 12),
                if (visibleOrders.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: InlineMessage(message: 'Hələ sifariş yoxdur.'),
                  )
                else
                  ...visibleOrders.map(
                    (order) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _OrderCard(
                        order: order,
                        onTap: () => _showOrderDetail(context, order.id),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateOrder,
        backgroundColor: BrandColors.primaryBurgundy,
        foregroundColor: BrandColors.white,
        shape: const StadiumBorder(),
        icon: const Icon(Icons.add),
        label: const Text(AppStrings.createOrder),
      ),
    );
  }

  Future<void> _openCreateOrder() async {
    final created = await Navigator.of(context).push<MobileOrder>(
      MaterialPageRoute(builder: (_) => const CompanyCreateOrderScreen()),
    );
    if (created != null && mounted) {
      // Start the list refresh immediately; the new detail has its own fetch.
      setState(() => _future = _load());
      await _showOrderDetail(context, created.id);
    }
  }

  Future<void> _showOrderDetail(BuildContext context, String id) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => _CompanyOrderDetailScreen(
          orderId: id,
          attendanceCache: widget.attendanceCache,
        ),
      ),
    );
    if (mounted) _refresh();
  }

  List<MobileOrder> _filterOrders(List<MobileOrder> orders) {
    final now = DateTime.now();
    return switch (_filter) {
      _OrderHistoryFilter.all => orders,
      _OrderHistoryFilter.active =>
        orders.where((order) => _companyOrderIsCurrent(order, now)).toList(),
      _OrderHistoryFilter.past =>
        orders
            .where(
              (order) =>
                  order.status == 'completed' ||
                  order.status == 'cancelled' ||
                  (order.endDatetime != null &&
                      order.endDatetime!.isBefore(now)),
            )
            .toList(),
    };
  }
}

enum _OrderHistoryFilter { active, past, all }

class _CompanyOrderDetailScreen extends StatefulWidget {
  const _CompanyOrderDetailScreen({
    required this.orderId,
    required this.attendanceCache,
  });

  final String orderId;
  final _CompanyAttendanceStatusCache attendanceCache;

  @override
  State<_CompanyOrderDetailScreen> createState() =>
      _CompanyOrderDetailScreenState();
}

class _CompanyOrderDetailScreenState extends State<_CompanyOrderDetailScreen> {
  late Future<_CompanyOrderDetailData> _future;
  bool _cancelling = false;
  String? _actionError;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_CompanyOrderDetailData> _load({
    bool refreshAttendance = false,
  }) async {
    final repo = context.read<CompanyRepository>();
    final orderFuture = repo.getOrder(widget.orderId);
    final assignmentsFuture = repo.listAssignments(orderId: widget.orderId);
    final order = await orderFuture;
    final assignments = await assignmentsFuture;
    final completedAttendanceIds = await widget.attendanceCache
        .loadCompletedIds(
          repo,
          assignments.data,
          orderId: widget.orderId,
          forceRefresh: refreshAttendance,
        );
    return _CompanyOrderDetailData(
      order: order,
      assignments: assignments.data,
      completedAttendanceIds: completedAttendanceIds,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load(refreshAttendance: true));
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.details)),
      body: Stack(
        children: [
          const Positioned.fill(
            child: IgnorePointer(child: LuxuryHotelBackdrop()),
          ),
          _AsyncView<_CompanyOrderDetailData>(
            future: _future,
            onRetry: _refresh,
            builder: (data) => RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
                children: [
                  _OrderCard(order: data.order),
                  const SizedBox(height: 12),
                  _CompanyOrderInformation(
                    order: data.order,
                    assignments: data.assignments,
                  ),
                  const SizedBox(height: 12),
                  CompanyOrderQrCard(order: data.order),
                  const SizedBox(height: 24),
                  Text(
                    AppStrings.assignedWorkers,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  if (data.assignments.isEmpty)
                    const InlineMessage(message: AppStrings.noAssignments)
                  else
                    ...data.assignments.map(
                      (assignment) => _AssignmentCard(
                        assignment,
                        checkoutCompleted: data.completedAttendanceIds.contains(
                          assignment.id,
                        ),
                      ),
                    ),
                  const SizedBox(height: 20),
                  if (_actionError != null) ...[
                    InlineMessage(
                      message: _actionError!,
                      kind: InlineMessageKind.error,
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (_companyOrderIsCurrent(data.order, DateTime.now()))
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _cancelling
                            ? null
                            : () async {
                                final confirmed = await _confirmAction(
                                  context,
                                  AppStrings.cancelOrderConfirm,
                                );
                                if (!confirmed || !context.mounted) {
                                  return;
                                }
                                final repo = context.read<CompanyRepository>();
                                setState(() {
                                  _cancelling = true;
                                  _actionError = null;
                                });
                                try {
                                  await repo.cancelOrder(data.order.id);
                                  if (mounted) await _refresh();
                                } on ApiException catch (error) {
                                  if (mounted) {
                                    setState(
                                      () => _actionError = error.message,
                                    );
                                  }
                                } catch (_) {
                                  if (mounted) {
                                    setState(
                                      () => _actionError =
                                          AppStrings.actionFailed,
                                    );
                                  }
                                } finally {
                                  if (mounted) {
                                    setState(() => _cancelling = false);
                                  }
                                }
                              },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: BrandColors.error,
                        ),
                        icon: const Icon(Icons.cancel_outlined),
                        label: Text(
                          _cancelling
                              ? AppStrings.working
                              : AppStrings.cancelOrder,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

bool _companyOrderIsCurrent(MobileOrder order, DateTime now) =>
    {
      'active',
      'published',
      'partially_assigned',
      'assigned',
      'in_progress',
    }.contains(order.status) &&
    (order.endDatetime == null || order.endDatetime!.isAfter(now));

String _companyDateTime(DateTime? value) => value == null
    ? AppStrings.noData
    : DateFormat('dd.MM.yyyy, HH:mm').format(value.toLocal());

class _CompanyDetailField extends StatelessWidget {
  const _CompanyDetailField({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.labelLarge?.copyWith(color: BrandColors.mutedBrown),
        ),
        const SizedBox(height: 4),
        Text(
          value.trim().isEmpty ? AppStrings.noData : value,
          style: Theme.of(context).textTheme.bodyLarge,
        ),
      ],
    ),
  );
}

class _CompanyOrderInformation extends StatelessWidget {
  const _CompanyOrderInformation({
    required this.order,
    required this.assignments,
  });
  final MobileOrder order;
  final List<Assignment> assignments;

  @override
  Widget build(BuildContext context) => PremiumCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: CompanyStrings.orderInformation),
        _CompanyDetailField(
          label: AppStrings.starts,
          value: _companyDateTime(order.startDatetime),
        ),
        _CompanyDetailField(
          label: AppStrings.ends,
          value: _companyDateTime(order.endDatetime),
        ),
        _CompanyDetailField(
          label: AppStrings.requiredWorkers,
          value: '${order.requiredCount}',
        ),
        _CompanyDetailField(
          label: CompanyStrings.assignedWorkers,
          value: '${order.assignmentCount}',
        ),
        _CompanyDetailField(
          label: CompanyStrings.acceptedWorkers,
          value:
              '${assignments.where((item) => item.status == 'accepted' || item.status == 'completed').length}',
        ),
        for (final item in order.categoryItems) ...[
          const Divider(height: 24),
          _CompanyDetailField(
            label: CompanyStrings.position,
            value: item.positionName ?? item.category,
          ),
          if (item.departmentName != null)
            _CompanyDetailField(
              label: CompanyStrings.department,
              value: item.departmentName!,
            ),
          if (item.subdepartmentName != null)
            _CompanyDetailField(
              label: CompanyStrings.subdepartment,
              value: item.subdepartmentName!,
            ),
          _CompanyDetailField(
            label: AppStrings.requiredWorkers,
            value: '${item.assignedCount}/${item.requiredCount}',
          ),
          if (item.notes?.trim().isNotEmpty == true)
            _CompanyDetailField(
              label: AppStrings.categoryNotes,
              value: item.notes!,
            ),
        ],
        const SectionHeader(title: CompanyStrings.workplace),
        _CompanyDetailField(
          label: CompanyStrings.address,
          value: order.location,
        ),
        const SectionHeader(title: CompanyStrings.additionalInformation),
        _CompanyDetailField(
          label: AppStrings.description,
          value: order.description,
        ),
      ],
    ),
  );
}
