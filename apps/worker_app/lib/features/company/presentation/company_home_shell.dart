import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/session/role_session_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/app_strings.dart';
import '../../../shared/models/mobile_models.dart';
import '../../../shared/widgets/constrained_page.dart';
import '../../../shared/widgets/inline_message.dart';
import '../../../shared/widgets/loading_button.dart';
import '../../../shared/widgets/premium_components.dart';
import '../../../shared/widgets/status_pill.dart';
import '../../assignments/data/models/assignment.dart';
import '../../attendance/data/models/attendance.dart';
import '../../notifications/data/models/notification_item.dart';
import '../../notifications/presentation/widgets/notification_card.dart';
import '../../taxonomy/data/taxonomy_repository.dart';
import '../data/company_repository.dart';
import 'company_auth_controller.dart';

class CompanyHomeShell extends StatefulWidget {
  const CompanyHomeShell({super.key});

  @override
  State<CompanyHomeShell> createState() => _CompanyHomeShellState();
}

class _CompanyHomeShellState extends State<CompanyHomeShell> {
  int _index = 0;
  late final List<Widget?> _tabs;
  final _attendanceCache = _CompanyAttendanceStatusCache();

  static const _titles = [
    'Müəssisə paneli',
    AppStrings.orders,
    'Təyin olunmuş işçilər',
    'Giriş və çıxışlar',
    AppStrings.notifications,
  ];

  @override
  void initState() {
    super.initState();
    _tabs = List<Widget?>.filled(_titles.length, null);
    _tabs[0] = _createTab(0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<CompanyAuthController>().registerPushForActiveSession();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _index == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _index != 0) {
          _selectTab(0);
        }
      },
      child: Scaffold(
        appBar: AppBar(title: Text(_titles[_index])),
        body: Stack(
          children: [
            const Positioned.fill(
              child: IgnorePointer(child: LuxuryHotelBackdrop()),
            ),
            IndexedStack(
              index: _index,
              children: List<Widget>.generate(_tabs.length, (index) {
                final tab = _tabs[index];
                return TickerMode(
                  enabled: _index == index,
                  child: tab ?? const SizedBox.shrink(),
                );
              }),
            ),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _selectedDestinationIndex,
          onDestinationSelected: _onDestinationSelected,
          destinations: const [
            NavigationDestination(
              selectedIcon: Icon(Icons.home_rounded),
              icon: Icon(Icons.home_outlined),
              label: AppStrings.home,
            ),
            NavigationDestination(
              selectedIcon: Icon(Icons.assignment_rounded),
              icon: Icon(Icons.assignment_outlined),
              label: AppStrings.orders,
            ),
            NavigationDestination(
              selectedIcon: Icon(Icons.groups_rounded),
              icon: Icon(Icons.groups_outlined),
              label: 'Heyət',
            ),
            NavigationDestination(
              selectedIcon: Icon(Icons.notifications_rounded),
              icon: Icon(Icons.notifications_outlined),
              label: AppStrings.alerts,
            ),
            NavigationDestination(
              icon: Icon(Icons.menu_rounded),
              label: 'Daha çox',
            ),
          ],
        ),
      ),
    );
  }

  int get _selectedDestinationIndex {
    return switch (_index) {
      0 => 0,
      1 => 1,
      2 => 2,
      4 => 3,
      _ => 4,
    };
  }

  Widget _createTab(int index) {
    return switch (index) {
      0 => const _CompanyDashboardTab(),
      1 => _CompanyOrdersTab(attendanceCache: _attendanceCache),
      2 => _CompanyAssignmentsTab(attendanceCache: _attendanceCache),
      3 => const _CompanyAttendanceTab(),
      4 => _CompanyNotificationsTab(attendanceCache: _attendanceCache),
      _ => const SizedBox.shrink(),
    };
  }

  void _selectTab(int index) {
    if (_index == index) return;
    setState(() {
      _tabs[index] ??= _createTab(index);
      _index = index;
    });
  }

  void _onDestinationSelected(int value) {
    if (value == 4) {
      _showMoreMenu();
      return;
    }
    final nextIndex = value == 3 ? 4 : value;
    _selectTab(nextIndex);
  }

  Future<void> _showMoreMenu() async {
    final selected = await showPremiumBottomSheet<_CompanyMoreAction>(
      context: context,
      child: Column(
        children: const [
          _MoreTile(
            icon: Icons.swap_horiz_rounded,
            title: 'Aktivlik',
            action: _CompanyMoreAction.attendance,
          ),
          _MoreTile(
            icon: Icons.bar_chart_rounded,
            title: 'Hesabat',
            action: _CompanyMoreAction.reports,
          ),
          _MoreTile(
            icon: Icons.logout_rounded,
            title: 'Çıxış',
            action: _CompanyMoreAction.logout,
          ),
        ],
      ),
    );

    if (!mounted || selected == null) return;
    switch (selected) {
      case _CompanyMoreAction.attendance:
        _selectTab(3);
        break;
      case _CompanyMoreAction.reports:
        await Navigator.of(context).push<void>(
          MaterialPageRoute(builder: (_) => const _CompanyReportsScreen()),
        );
        break;
      case _CompanyMoreAction.logout:
        await context.read<CompanyAuthController>().logout();
        if (mounted) {
          await context.read<RoleSessionController>().clearRole();
        }
        break;
    }
  }
}

enum _CompanyMoreAction { attendance, reports, logout }

class _MoreTile extends StatelessWidget {
  const _MoreTile({
    required this.icon,
    required this.title,
    required this.action,
  });

  final IconData icon;
  final String title;
  final _CompanyMoreAction action;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minVerticalPadding: 16,
      leading: Icon(icon),
      title: Text(title, style: Theme.of(context).textTheme.titleLarge),
      trailing: action == _CompanyMoreAction.logout
          ? null
          : const Icon(Icons.chevron_right),
      onTap: () => Navigator.of(context).pop(action),
    );
  }
}

class _CompanyDashboardTab extends StatefulWidget {
  const _CompanyDashboardTab();

  @override
  State<_CompanyDashboardTab> createState() => _CompanyDashboardTabState();
}

class _CompanyDashboardTabState extends State<_CompanyDashboardTab> {
  late Future<_CompanyDashboardData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_CompanyDashboardData> _load() async {
    final repo = context.read<CompanyRepository>();
    final companyFuture = repo.getMe();
    final ordersFuture = repo.listOrders();
    final assignmentsFuture = repo.listAssignments();
    final attendanceFuture = repo.listAttendance();
    final company = await companyFuture;
    final orders = await ordersFuture;
    final assignments = await assignmentsFuture;
    final attendance = await attendanceFuture;
    return _CompanyDashboardData(
      company: company,
      orders: orders.data,
      assignments: assignments.data,
      attendance: attendance.data,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<_CompanyDashboardData>(
      future: _future,
      onRetry: _refresh,
      builder: (data) => RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 22),
          children: [
            PremiumEntrance(
              child: PremiumHeroPanel(
                title: data.company.name,
                subtitle: 'Restoran Meneceri',
                trailing: StatusPill(status: data.company.status),
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 220,
                        child: PremiumActionButton(
                          secondary: true,
                          icon: Icons.add_rounded,
                          label: AppStrings.createOrder,
                          onPressed: _openCreateOrder,
                        ),
                      ),
                      const SizedBox(height: 12),
                      const SizedBox(
                        width: 220,
                        child: PremiumActionButton(
                          secondary: true,
                          label: AppStrings.operationsSummary,
                          onPressed: null,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            const SectionHeader(title: AppStrings.operationsSummary),
            PremiumEntrance(
              delay: const Duration(milliseconds: 90),
              child: _SummaryGrid(
                items: [
                  _SummaryItem(
                    AppStrings.activeOrders,
                    data.orders.where((item) => item.status == 'active').length,
                  ),
                  _SummaryItem(
                    AppStrings.activeWorkers,
                    data.assignments
                        .where((item) => item.status == 'accepted')
                        .length,
                  ),
                  _SummaryItem(
                    AppStrings.totalAssignments,
                    data.assignments.length,
                  ),
                  _SummaryItem(
                    AppStrings.todayCheckIns,
                    data.attendance.length,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openCreateOrder() async {
    final created = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const _CreateOrderScreen()));
    if (created == true) {
      await _refresh();
    }
  }
}

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
    final created = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => const _CreateOrderScreen()));
    if (created == true) {
      await _refresh();
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
        orders.where((order) => order.status == 'active').toList(),
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
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
                children: [
                  _OrderCard(order: data.order),
                  const SizedBox(height: 12),
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
                  if (data.order.status == 'active')
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final confirmed = await _confirmAction(
                            context,
                            AppStrings.cancelOrderConfirm,
                          );
                          if (!confirmed || !context.mounted) {
                            return;
                          }
                          final repo = context.read<CompanyRepository>();
                          final navigator = Navigator.of(context);
                          await repo.cancelOrder(data.order.id);
                          if (mounted) navigator.pop();
                        },
                        icon: const Icon(Icons.cancel_outlined),
                        label: const Text(AppStrings.cancelOrder),
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

class _CompanyAssignmentsTab extends StatefulWidget {
  const _CompanyAssignmentsTab({required this.attendanceCache});

  final _CompanyAttendanceStatusCache attendanceCache;

  @override
  State<_CompanyAssignmentsTab> createState() => _CompanyAssignmentsTabState();
}

class _CompanyAssignmentsTabState extends State<_CompanyAssignmentsTab> {
  late Future<_CompanyAssignmentsData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_CompanyAssignmentsData> _load({
    bool refreshAttendance = false,
  }) async {
    final repo = context.read<CompanyRepository>();
    final assignments = await repo.listAssignments();
    final completedAttendanceIds = await widget.attendanceCache
        .loadCompletedIds(
          repo,
          assignments.data,
          forceRefresh: refreshAttendance,
        );

    return _CompanyAssignmentsData(
      assignments: assignments,
      completedAttendanceIds: completedAttendanceIds,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load(refreshAttendance: true));
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<_CompanyAssignmentsData>(
      future: _future,
      onRetry: _refresh,
      builder: (data) {
        if (data.assignments.data.isEmpty) {
          return _EmptyState(
            message: AppStrings.noAssignments,
            onAction: _refresh,
          );
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: data.assignments.data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, index) {
              final assignment = data.assignments.data[index];
              return _AssignmentCard(
                assignment,
                checkoutCompleted: data.completedAttendanceIds.contains(
                  assignment.id,
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _CompanyAttendanceTab extends StatefulWidget {
  const _CompanyAttendanceTab();

  @override
  State<_CompanyAttendanceTab> createState() => _CompanyAttendanceTabState();
}

class _CompanyAttendanceTabState extends State<_CompanyAttendanceTab> {
  late Future<AttendancePage> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<CompanyRepository>().listAttendance();
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<CompanyRepository>().listAttendance(),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<AttendancePage>(
      future: _future,
      onRetry: _refresh,
      builder: (page) {
        if (page.data.isEmpty) {
          return _ActivityEmptyState(onRetry: _refresh);
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: page.data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, index) => _AttendanceCard(page.data[index]),
          ),
        );
      },
    );
  }
}

class _CompanyNotificationsTab extends StatefulWidget {
  const _CompanyNotificationsTab({required this.attendanceCache});

  final _CompanyAttendanceStatusCache attendanceCache;

  @override
  State<_CompanyNotificationsTab> createState() =>
      _CompanyNotificationsTabState();
}

class _CompanyNotificationsTabState extends State<_CompanyNotificationsTab> {
  late Future<NotificationPage> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<CompanyRepository>().listNotifications();
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<CompanyRepository>().listNotifications(),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<NotificationPage>(
      future: _future,
      onRetry: _refresh,
      builder: (page) {
        if (page.data.isEmpty) {
          return _EmptyState(
            message: AppStrings.noNotifications,
            onAction: _refresh,
          );
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: page.data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, index) {
              final item = page.data[index];
              return NotificationCard(
                notification: item,
                title: _notificationTitle(item),
                body: _notificationBody(item),
                onTap: () => _openNotification(item),
              );
            },
          ),
        );
      },
    );
  }

  Future<void> _openNotification(NotificationItem item) async {
    if (item.isUnread) {
      try {
        await context.read<CompanyRepository>().markNotificationRead(item.id);
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.notificationReadFailed)),
        );
        return;
      }
    }

    if (!mounted) return;
    final orderId = _metadataString(item, 'order_id');
    final workerId = _metadataString(item, 'worker_id');

    if (orderId != null) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _CompanyOrderDetailScreen(
            orderId: orderId,
            attendanceCache: widget.attendanceCache,
          ),
        ),
      );
    } else if (workerId != null) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _CompanyWorkerProfileScreen(workerId: workerId),
        ),
      );
    } else {
      await showNotificationDetailSheet(
        context: context,
        notification: item,
        title: _notificationTitle(item),
        body: _notificationBody(item),
      );
    }
    if (mounted) await _refresh();
  }

  String? _metadataString(NotificationItem item, String key) {
    final value = item.metadata[key];
    if (value is String && value.trim().isNotEmpty) return value.trim();
    return null;
  }
}

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
        setState(() => _error = 'Şöbə, Departament və Vəzifə seçilməlidir.');
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
      placeholder: taxonomy.isEmpty ? 'Şöbə tapılmadı' : 'Şöbə seç',
      onTap: taxonomy.isEmpty
          ? null
          : () async {
              final value = await _showOrderOptionSheet<TaxonomyDepartment>(
                context: context,
                title: 'Şöbə seç',
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
                title: 'Departament seç',
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
                title: 'Vəzifə seç',
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

class _AssignmentCard extends StatefulWidget {
  const _AssignmentCard(this.assignment, {this.checkoutCompleted = false});

  final Assignment assignment;
  final bool checkoutCompleted;

  @override
  State<_AssignmentCard> createState() => _AssignmentCardState();
}

class _AssignmentCardState extends State<_AssignmentCard> {
  bool _rating = false;

  @override
  Widget build(BuildContext context) {
    final assignment = widget.assignment;
    final statusHelp = AppStrings.assignmentStatusHelp(assignment.status);
    return Premium3DCard(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    assignment.worker.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                StatusPill(status: assignment.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              assignment.order.location,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(
              assignment.order.title,
              style: Theme.of(
                context,
              ).textTheme.bodyLarge?.copyWith(color: BrandColors.mutedBrown),
            ),
            if (statusHelp != null) ...[
              const SizedBox(height: 8),
              InlineMessage(message: statusHelp),
            ],
            if (assignment.status == 'accepted') ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => _showQr(context, assignment.id),
                    icon: const Icon(Icons.qr_code_2),
                    label: const Text(AppStrings.generateQrToken),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _showKioskInfo(context),
                    icon: const Icon(Icons.tablet_mac_outlined),
                    label: const Text('QR ekranı yarat'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _openWorkerProfile(context),
                    icon: const Icon(Icons.badge_outlined),
                    label: const Text(AppStrings.viewProfile),
                  ),
                ],
              ),
            ],
            if (_isPotentiallyRateableAssignment(assignment)) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: widget.checkoutCompleted && !_rating
                    ? () => _rateWorker(context)
                    : null,
                icon: const Icon(Icons.star_outline),
                label: Text(
                  _rating
                      ? AppStrings.working
                      : widget.checkoutCompleted
                      ? AppStrings.rateWorker
                      : AppStrings.checkoutIncomplete,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _openWorkerProfile(BuildContext context) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) =>
            _CompanyWorkerProfileScreen(workerId: widget.assignment.workerId),
      ),
    );
  }

  Future<void> _showQr(BuildContext context, String assignmentId) async {
    try {
      final qr = await context.read<CompanyRepository>().generateQrToken(
        assignmentId,
      );
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text(AppStrings.generateQrToken),
          content: SelectableText(qr.token),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
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

  Future<void> _showKioskInfo(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (_) => const AlertDialog(
        title: Text('QR ekranı'),
        content: Text(
          'Venue kiosk linkləri admin panelindən yaradılır və sifariş/növbə əsasında aktiv edilir. Bu ekrandan yalnız birdəfəlik QR token göstərilir.',
        ),
      ),
    );
  }

  // ignore: unused_element
  Future<void> _createKiosk(BuildContext context, String assignmentId) async {
    try {
      final kiosk = await context.read<CompanyRepository>().createKioskSession(
        assignmentId,
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
              const Text('Bu linki girişdəki tablet brauzerində açın.'),
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
                await context.read<CompanyRepository>().revokeKioskSession(
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
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasScheme) {
      await Clipboard.setData(ClipboardData(text: url));
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('QR linki kopyalandı.')));
      return;
    }

    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('QR linkini açmaq mümkün olmadı.')),
      );
    }
  }

  Future<void> _rateWorker(BuildContext context) async {
    final result = await showDialog<_RatingInput>(
      context: context,
      builder: (_) => const _RateWorkerDialog(),
    );
    if (result == null || !context.mounted) return;
    setState(() => _rating = true);
    try {
      await context.read<CompanyRepository>().rateWorker(
        assignmentId: widget.assignment.id,
        score: result.score,
        feedback: result.feedback,
      );
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(AppStrings.ratingSent)));
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _rating = false);
    }
  }
}

class _CompanyWorkerProfileScreen extends StatefulWidget {
  const _CompanyWorkerProfileScreen({required this.workerId});

  final String workerId;

  @override
  State<_CompanyWorkerProfileScreen> createState() =>
      _CompanyWorkerProfileScreenState();
}

class _CompanyWorkerProfileScreenState
    extends State<_CompanyWorkerProfileScreen> {
  late Future<CompanyVisibleWorkerProfile> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<CompanyVisibleWorkerProfile> _load() {
    return context.read<CompanyRepository>().getWorkerProfile(widget.workerId);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.viewProfile)),
      body: _AsyncView<CompanyVisibleWorkerProfile>(
        future: _future,
        onRetry: _refresh,
        builder: (profile) => RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              PremiumHeroPanel(
                title: profile.name,
                subtitle: profile.position.isEmpty
                    ? AppStrings.worker
                    : profile.position,
                compact: true,
                leading: CircleAvatar(
                  radius: 26,
                  backgroundColor: BrandColors.white.withValues(alpha: 0.18),
                  backgroundImage: profile.profilePhotoUrl == null
                      ? null
                      : NetworkImage(profile.profilePhotoUrl!),
                  child: profile.profilePhotoUrl == null
                      ? const Icon(
                          Icons.person_outline,
                          color: BrandColors.white,
                        )
                      : null,
                ),
                children: [
                  PremiumChip(
                    label:
                        '★ ${profile.ratingAverage.toStringAsFixed(1)} (${profile.ratingCount})',
                    icon: Icons.star_outline,
                    dark: true,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _ChipSection(title: AppStrings.skills, values: profile.skills),
              const SizedBox(height: 12),
              _ChipSection(
                title: AppStrings.languages,
                values: profile.languages,
              ),
              const SizedBox(height: 12),
              PremiumCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      AppStrings.workHistory,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    if (profile.workHistory.isNotEmpty)
                      ...profile.workHistory.map(
                        (item) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.timeline_outlined),
                          title: Text(item.companyName),
                          subtitle: Text(
                            [
                              item.position,
                              if (item.note.trim().isNotEmpty) item.note,
                            ].join('\n'),
                          ),
                        ),
                      )
                    else
                      Text(
                        profile.workHistorySummary?.trim().isNotEmpty == true
                            ? profile.workHistorySummary!
                            : AppStrings.noData,
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              PremiumCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      AppStrings.documents,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    if (profile.documents.isEmpty)
                      const Text(AppStrings.noDocumentsUploaded)
                    else
                      ...profile.documents.map(
                        (document) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.description_outlined),
                          title: Text(
                            document.name?.isNotEmpty == true
                                ? document.name!
                                : document.type,
                          ),
                          subtitle: Text(document.type),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChipSection extends StatelessWidget {
  const _ChipSection({required this.title, required this.values});

  final String title;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          if (values.isEmpty)
            const Text(AppStrings.noData)
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: values
                  .map((value) => PremiumChip(label: value))
                  .toList(growable: false),
            ),
        ],
      ),
    );
  }
}

class _RateWorkerDialog extends StatefulWidget {
  const _RateWorkerDialog();

  @override
  State<_RateWorkerDialog> createState() => _RateWorkerDialogState();
}

class _RateWorkerDialogState extends State<_RateWorkerDialog> {
  int _score = 5;
  final _feedback = TextEditingController();

  @override
  void dispose() {
    _feedback.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text(AppStrings.rateWorker),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          DropdownButtonFormField<int>(
            value: _score,
            decoration: const InputDecoration(labelText: AppStrings.rating),
            items: [5, 4, 3, 2, 1]
                .map(
                  (score) =>
                      DropdownMenuItem(value: score, child: Text('$score/5')),
                )
                .toList(),
            onChanged: (value) => setState(() => _score = value ?? 5),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _feedback,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: AppStrings.ratingFeedback,
              hintText: AppStrings.ratingFeedbackHint,
            ),
          ),
          const SizedBox(height: 8),
          const Text(AppStrings.ratingAvailableAfterCheckout),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text(AppStrings.cancel),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(
            context,
          ).pop(_RatingInput(score: _score, feedback: _feedback.text)),
          child: const Text(AppStrings.confirm),
        ),
      ],
    );
  }
}

class _RatingInput {
  const _RatingInput({required this.score, required this.feedback});

  final int score;
  final String feedback;
}

class _AttendanceCard extends StatelessWidget {
  const _AttendanceCard(this.item);

  final AttendanceLog item;

  @override
  Widget build(BuildContext context) {
    final status = item.checkoutTime != null
        ? 'completed'
        : item.checkinTime != null
        ? 'checked_in'
        : 'waiting';
    return PremiumCard(
      child: ListTile(
        title: Text(item.assignmentId),
        subtitle: Text(
          item.durationMinutes == null
              ? AppStrings.attendance
              : '${item.durationMinutes} dəq',
        ),
        trailing: StatusPill(status: status),
      ),
    );
  }
}

class _CompanyReportsScreen extends StatefulWidget {
  const _CompanyReportsScreen();

  @override
  State<_CompanyReportsScreen> createState() => _CompanyReportsScreenState();
}

class _CompanyReportsScreenState extends State<_CompanyReportsScreen> {
  String? _workerId;
  String? _category;
  DateTime? _startDate;
  DateTime? _endDate;
  late Future<_CompanyReportsData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_CompanyReportsData> _load() async {
    final repo = context.read<CompanyRepository>();
    final results = await Future.wait([
      repo.getReportSummary(
        workerId: _workerId,
        category: _category,
        startDate: _startDate,
        endDate: _endDate,
      ),
      repo.listAssignments(),
      repo.listOrders(),
    ]);
    return _CompanyReportsData(
      report: results[0] as AdminReportSummary,
      assignments: (results[1] as AssignmentPage).data,
      orders: (results[2] as MobileOrderPage).data,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.reports)),
      body: Stack(
        children: [
          const Positioned.fill(
            child: IgnorePointer(child: LuxuryHotelBackdrop()),
          ),
          _AsyncView<_CompanyReportsData>(
            future: _future,
            onRetry: _refresh,
            builder: (data) {
              final workers = _workerOptions(data.assignments);
              final categories = _categoryOptions(data);
              return RefreshIndicator(
                onRefresh: _refresh,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const PremiumHeroPanel(
                      title: AppStrings.reports,
                      subtitle: 'Yalnız öz müəssisənizin sifarişləri üzrə.',
                      compact: true,
                      children: [
                        PremiumChip(
                          label: 'Telefon və e-poçt məlumatları göstərilmir',
                          icon: Icons.privacy_tip_outlined,
                          dark: true,
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    PremiumCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Filtrlər',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            value: _workerId,
                            decoration: const InputDecoration(
                              labelText: AppStrings.worker,
                              prefixIcon: Icon(Icons.person_search_outlined),
                            ),
                            items: [
                              const DropdownMenuItem<String>(
                                value: null,
                                child: Text('Bütün işçilər'),
                              ),
                              ...workers.map(
                                (worker) => DropdownMenuItem(
                                  value: worker.id,
                                  child: Text(worker.name),
                                ),
                              ),
                            ],
                            onChanged: (value) => setState(() {
                              _workerId = value;
                              _future = _load();
                            }),
                          ),
                          const SizedBox(height: 10),
                          DropdownButtonFormField<String>(
                            value: _category,
                            decoration: const InputDecoration(
                              labelText: AppStrings.category,
                              prefixIcon: Icon(Icons.room_service_outlined),
                            ),
                            items: [
                              const DropdownMenuItem<String>(
                                value: null,
                                child: Text('Bütün vəzifələr'),
                              ),
                              ...categories.map(
                                (category) => DropdownMenuItem(
                                  value: category,
                                  child: Text(category),
                                ),
                              ),
                            ],
                            onChanged: (value) => setState(() {
                              _category = value;
                              _future = _load();
                            }),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton.icon(
                                onPressed: () => _pickDate(isStart: true),
                                icon: const Icon(Icons.date_range_outlined),
                                label: Text(
                                  _startDate == null
                                      ? 'Başlama tarixi'
                                      : _dateLabel(_startDate!),
                                ),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => _pickDate(isStart: false),
                                icon: const Icon(Icons.event_outlined),
                                label: Text(
                                  _endDate == null
                                      ? 'Bitmə tarixi'
                                      : _dateLabel(_endDate!),
                                ),
                              ),
                              TextButton.icon(
                                onPressed: _clearFilters,
                                icon: const Icon(Icons.clear_all_outlined),
                                label: const Text('Təmizlə'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    _SummaryGrid(
                      items: [
                        _SummaryItem(
                          'Çağırılan işçi',
                          data.report.dashboard.activeAssignments,
                        ),
                        _SummaryItem(
                          'Check-in edən',
                          data.report.reports.attendance.totalCount,
                        ),
                        _SummaryItem(
                          'Checkout tamamlayan',
                          data.report.reports.attendance.completedCount,
                        ),
                        _SummaryItem(
                          'Orta reytinq',
                          data.report.reports.ratingStats.average.round(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    PremiumCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Göndərilən işçilər',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 8),
                          if (workers.isEmpty)
                            const Text(AppStrings.noData)
                          else
                            ...workers
                                .take(8)
                                .map(
                                  (worker) => ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: const Icon(Icons.badge_outlined),
                                    title: Text(worker.name),
                                    subtitle: Text(worker.position),
                                  ),
                                ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _pickDate({required bool isStart}) async {
    final now = DateTime.now();
    final current = isStart ? _startDate : _endDate;
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? now,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 1),
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (isStart) {
        _startDate = picked;
      } else {
        _endDate = picked;
      }
      _future = _load();
    });
  }

  void _clearFilters() {
    setState(() {
      _workerId = null;
      _category = null;
      _startDate = null;
      _endDate = null;
      _future = _load();
    });
  }

  String _dateLabel(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    return '$day.$month.${value.year}';
  }

  List<_CompanyReportWorkerOption> _workerOptions(
    List<Assignment> assignments,
  ) {
    final items = <String, _CompanyReportWorkerOption>{};
    for (final assignment in assignments) {
      if (assignment.worker.id.isEmpty) continue;
      items[assignment.worker.id] = _CompanyReportWorkerOption(
        id: assignment.worker.id,
        name: assignment.worker.name,
        position: assignment.worker.position.isEmpty
            ? assignment.category
            : assignment.worker.position,
      );
    }
    final values = items.values.toList()
      ..sort((a, b) => a.name.compareTo(b.name));
    return values;
  }

  List<String> _categoryOptions(_CompanyReportsData data) {
    final values = <String>{
      ...data.assignments
          .map((item) => item.category)
          .where((item) => item.isNotEmpty),
      ...data.orders
          .map((item) => item.category)
          .where((item) => item.isNotEmpty),
    }.toList()..sort((a, b) => a.compareTo(b));
    return values;
  }
}

class _CompanyReportsData {
  const _CompanyReportsData({
    required this.report,
    required this.assignments,
    required this.orders,
  });

  final AdminReportSummary report;
  final List<Assignment> assignments;
  final List<MobileOrder> orders;
}

class _CompanyReportWorkerOption {
  const _CompanyReportWorkerOption({
    required this.id,
    required this.name,
    required this.position,
  });

  final String id;
  final String name;
  final String position;
}

class _AsyncView<T> extends StatelessWidget {
  const _AsyncView({
    required this.future,
    required this.builder,
    required this.onRetry,
  });

  final Future<T> future;
  final Widget Function(T data) builder;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const ConstrainedPage(child: PremiumListSkeleton());
        }
        if (snapshot.hasError) {
          final error = snapshot.error;
          return ConstrainedPage(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                InlineMessage(
                  message: error is ApiException
                      ? error.message
                      : AppStrings.loadFailed,
                  kind: InlineMessageKind.error,
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text(AppStrings.tryAgain),
                ),
              ],
            ),
          );
        }
        return builder(snapshot.data as T);
      },
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message, this.onAction});

  final String message;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return ConstrainedPage(
      child: PremiumEmptyState(
        title: AppStrings.elegantEmptyTitle,
        message: message,
        icon: Icons.inbox_outlined,
        action: onAction == null
            ? null
            : OutlinedButton.icon(
                onPressed: onAction,
                icon: const Icon(Icons.refresh),
                label: const Text(AppStrings.tryAgain),
              ),
      ),
    );
  }
}

class _ActivityEmptyState extends StatelessWidget {
  const _ActivityEmptyState({required this.onRetry});

  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return ConstrainedPage(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.person_off_outlined,
            size: 82,
            color: BrandColors.accentGold,
          ),
          const SizedBox(height: 28),
          Text(
            'Hələ məlumat yoxdur',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.displaySmall?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Yenidən cəhd et'),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({required this.items});

  final List<_SummaryItem> items;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 520 ? 2 : 1;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: items.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            mainAxisExtent: 112,
          ),
          itemBuilder: (context, index) {
            final item = items[index];
            return PremiumEntrance(
              delay: Duration(milliseconds: 70 * index),
              offset: const Offset(0, 10),
              child: Premium3DCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 18,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.label,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Text(
                      '${item.value}',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _SummaryItem {
  const _SummaryItem(this.label, this.value);

  final String label;
  final int value;
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
  return result == true;
}

String _notificationTitle(NotificationItem item) {
  if (item.title.trim().isNotEmpty) return item.title.trim();
  return switch (item.type) {
    'order_created' => AppStrings.createOrder,
    'company_approved' => AppStrings.companyRole,
    'company_rejected' => AppStrings.accountUnavailableTitle,
    'job_assigned' => AppStrings.newAssignmentNotification,
    _ => AppStrings.systemNotification,
  };
}

String _notificationBody(NotificationItem item) {
  if (item.body.trim().isNotEmpty) return item.body.trim();
  return switch (item.type) {
    'company_approved' => AppStrings.companyApprovedMessage,
    'company_rejected' => AppStrings.companyRejectedMessage,
    'job_assigned' => AppStrings.jobAssignedBody,
    _ => AppStrings.systemNotification,
  };
}

class _CompanyDashboardData {
  const _CompanyDashboardData({
    required this.company,
    required this.orders,
    required this.assignments,
    required this.attendance,
  });

  final MobileCompanyProfile company;
  final List<MobileOrder> orders;
  final List<Assignment> assignments;
  final List<AttendanceLog> attendance;
}

class _CompanyOrderDetailData {
  const _CompanyOrderDetailData({
    required this.order,
    required this.assignments,
    required this.completedAttendanceIds,
  });

  final MobileOrder order;
  final List<Assignment> assignments;
  final Set<String> completedAttendanceIds;
}

class _CompanyAssignmentsData {
  const _CompanyAssignmentsData({
    required this.assignments,
    required this.completedAttendanceIds,
  });

  final AssignmentPage assignments;
  final Set<String> completedAttendanceIds;
}

bool _isPotentiallyRateableAssignment(Assignment assignment) {
  return assignment.status == 'accepted' || assignment.status == 'completed';
}

class _CompanyAttendanceStatusCache {
  static const _allAssignmentsScope = 'all';

  final Map<String, Set<String>> _completedIdsByScope = <String, Set<String>>{};
  final Map<String, Future<Set<String>>> _inFlight =
      <String, Future<Set<String>>>{};

  Future<Set<String>> loadCompletedIds(
    CompanyRepository repo,
    List<Assignment> assignments, {
    String? orderId,
    bool forceRefresh = false,
  }) async {
    final scope = orderId ?? _allAssignmentsScope;
    final candidates = assignments
        .where(_isPotentiallyRateableAssignment)
        .toList(growable: false);

    if (forceRefresh) _completedIdsByScope.remove(scope);
    final completedIds = await _loadScope(repo, scope, orderId: orderId);

    return candidates
        .where((assignment) => completedIds.contains(assignment.id))
        .map((assignment) => assignment.id)
        .toSet();
  }

  Future<Set<String>> _loadScope(
    CompanyRepository repo,
    String scope, {
    String? orderId,
  }) {
    final cached = _completedIdsByScope[scope];
    if (cached != null) return Future<Set<String>>.value(cached);

    return _inFlight.putIfAbsent(scope, () async {
      try {
        const pageSize = 100;
        var page = 1;
        final completedIds = <String>{};
        while (true) {
          final attendance = await repo.listAttendance(
            orderId: orderId,
            limit: pageSize,
            page: page,
          );
          completedIds.addAll(
            attendance.data
                .where((item) => item.checkoutTime != null)
                .map((item) => item.assignmentId),
          );
          if (attendance.data.length < pageSize) break;
          page += 1;
        }
        _completedIdsByScope[scope] = completedIds;
        return completedIds;
      } finally {
        _inFlight.remove(scope);
      }
    });
  }
}
