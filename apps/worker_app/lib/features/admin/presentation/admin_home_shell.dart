import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../data/admin_repository.dart';
import 'admin_auth_controller.dart';

class AdminHomeShell extends StatefulWidget {
  const AdminHomeShell({super.key});

  @override
  State<AdminHomeShell> createState() => _AdminHomeShellState();
}

class _AdminHomeShellState extends State<AdminHomeShell> {
  int _index = 0;
  late final List<Widget?> _tabs;

  static const _titles = [
    'Kontrol paneli',
    'Təsdiqlər',
    AppStrings.orders,
    'Təyinatlar',
    'Davamiyyət',
    'İşçilər',
    'Müəssisələr',
    AppStrings.reports,
    AppStrings.notifications,
  ];

  @override
  void initState() {
    super.initState();
    _tabs = List<Widget?>.filled(_titles.length, null);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<AdminAuthController>().registerPushForActiveSession();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AdminAuthController>();
    final allowedIndexes = _allowedAdminIndexes(auth);
    final activeIndex = allowedIndexes.contains(_index)
        ? _index
        : (allowedIndexes.isEmpty ? 0 : allowedIndexes.first);
    if (allowedIndexes.isNotEmpty) {
      _tabs[activeIndex] ??= _createTab(activeIndex);
    }
    return PopScope(
      canPop: activeIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && activeIndex != 0) {
          _selectTab(allowedIndexes.contains(0) ? 0 : allowedIndexes.first);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          toolbarHeight: 82,
          titleSpacing: 0,
          backgroundColor: BrandColors.creamBackground,
          surfaceTintColor: BrandColors.transparent,
          title: Text(
            _titles[activeIndex],
            style: const TextStyle(
              color: BrandColors.darkText,
              fontSize: 27,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.8,
            ),
          ),
        ),
        drawer: _AdminDrawer(
          allowedIndexes: allowedIndexes,
          selectedIndex: activeIndex,
          adminName: auth.adminName,
          onSelected: _selectTab,
          onLogout: auth.isSubmitting
              ? null
              : () async {
                  await context.read<AdminAuthController>().logout();
                  if (context.mounted) {
                    await context.read<RoleSessionController>().clearRole();
                  }
                },
        ),
        body: Stack(
          children: [
            const Positioned.fill(
              child: IgnorePointer(child: LuxuryHotelBackdrop()),
            ),
            allowedIndexes.isEmpty
                ? const _PermissionDeniedView()
                : IndexedStack(
                    index: activeIndex,
                    children: List<Widget>.generate(_tabs.length, (index) {
                      final tab = _tabs[index];
                      return TickerMode(
                        enabled: activeIndex == index,
                        child: tab ?? const SizedBox.shrink(),
                      );
                    }),
                  ),
          ],
        ),
      ),
    );
  }

  Widget _createTab(int index) {
    return switch (index) {
      0 => _AdminDashboardTab(onNavigate: _selectTab),
      1 => const _ApprovalsTab(),
      2 => const _AdminOrdersTab(),
      3 => const _AdminAssignmentsTab(),
      4 => const _AdminAttendanceTab(),
      5 => const _AdminWorkersDirectoryTab(),
      6 => const _AdminCompaniesDirectoryTab(),
      7 => const _AdminReportsTab(),
      8 => const _AdminNotificationsTab(),
      _ => const SizedBox.shrink(),
    };
  }

  void _selectTab(int index) {
    if (_index == index && _tabs[index] != null) return;
    setState(() {
      _tabs[index] ??= _createTab(index);
      _index = index;
    });
  }
}

List<int> _allowedAdminIndexes(AdminAuthController auth) {
  final result = <int>[];
  for (final entry in _adminIndexPermissions.entries) {
    if (entry.value.any(auth.hasPermission)) result.add(entry.key);
  }
  return result;
}

const _adminIndexPermissions = <int, List<String>>{
  0: ['view_dashboard'],
  1: ['manage_workers', 'manage_companies'],
  2: ['view_orders'],
  3: ['view_assignments'],
  4: ['view_attendance'],
  5: ['view_workers'],
  6: ['view_companies'],
  7: ['view_reports'],
  8: ['view_notifications'],
};

class _AdminDrawer extends StatelessWidget {
  const _AdminDrawer({
    required this.allowedIndexes,
    required this.selectedIndex,
    required this.onSelected,
    required this.onLogout,
    this.adminName,
  });

  final List<int> allowedIndexes;
  final int selectedIndex;
  final String? adminName;
  final ValueChanged<int> onSelected;
  final Future<void> Function()? onLogout;

  @override
  Widget build(BuildContext context) {
    const items = [
      _DrawerItem('Kontrol paneli', Icons.grid_view_rounded),
      _DrawerItem('Təsdiqlər', Icons.verified_outlined),
      _DrawerItem('Sifarişlər', Icons.receipt_long_outlined),
      _DrawerItem('Təyinatlar', Icons.assignment_turned_in_outlined),
      _DrawerItem('Davamiyyət', Icons.center_focus_strong_outlined),
      _DrawerItem('İşçilər', Icons.groups_2_outlined),
      _DrawerItem('Müəssisələr', Icons.apartment_outlined),
      _DrawerItem('Hesabatlar', Icons.bar_chart_rounded),
      _DrawerItem('Bildirişlər', Icons.notifications_none_rounded),
    ];

    final visibleIndexes = allowedIndexes
        .where((index) => index >= 0 && index < items.length)
        .toList(growable: false);

    return Drawer(
      width: MediaQuery.sizeOf(context).width * 0.79,
      backgroundColor: BrandColors.cardCream,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            Container(
              width: double.infinity,
              height: 170,
              padding: const EdgeInsets.fromLTRB(18, 36, 18, 18),
              color: BrandColors.primaryBurgundy,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: Align(
                      alignment: Alignment.topLeft,
                      child: Text(
                        'SET',
                        style: TextStyle(
                          color: BrandColors.accentGold.withValues(alpha: 0.32),
                          fontFamily: 'serif',
                          fontSize: 112,
                          fontWeight: FontWeight.w400,
                          height: 0.92,
                          letterSpacing: -8,
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 4,
                    bottom: 0,
                    child: Text(
                      adminName?.trim().isNotEmpty == true
                          ? adminName!
                          : 'Admin',
                      style: const TextStyle(
                        color: BrandColors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 18, 12, 10),
                itemCount: visibleIndexes.length,
                itemBuilder: (context, index) {
                  final actualIndex = visibleIndexes[index];
                  final item = items[actualIndex];
                  final selected = actualIndex == selectedIndex;
                  return Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 2,
                    ),
                    child: ListTile(
                      minTileHeight: 54,
                      selected: selected,
                      selectedTileColor: const Color(0xFFFFC9C6),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28),
                      ),
                      leading: Icon(
                        item.icon,
                        color: selected
                            ? BrandColors.primaryBurgundy
                            : BrandColors.darkText,
                      ),
                      title: Text(
                        item.label,
                        style: TextStyle(
                          fontWeight: selected
                              ? FontWeight.w800
                              : FontWeight.w600,
                          fontSize: 18,
                        ),
                      ),
                      onTap: () {
                        Navigator.of(context).pop();
                        onSelected(actualIndex);
                      },
                    ),
                  );
                },
              ),
            ),
            const Divider(height: 1, color: BrandColors.accentGold),
            ListTile(
              minTileHeight: 72,
              contentPadding: const EdgeInsets.symmetric(horizontal: 24),
              leading: const Icon(Icons.logout, color: BrandColors.darkText),
              title: const Text(
                'Çıxış',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18),
              ),
              onTap: onLogout == null
                  ? null
                  : () async {
                      Navigator.of(context).pop();
                      await onLogout!.call();
                    },
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerItem {
  const _DrawerItem(this.label, this.icon);

  final String label;
  final IconData icon;
}

class _PermissionDeniedView extends StatelessWidget {
  const _PermissionDeniedView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: InlineMessage(message: 'Bu bölməyə giriş icazəniz yoxdur.'),
      ),
    );
  }
}

class _AdminBackdrop extends StatelessWidget {
  const _AdminBackdrop({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const Positioned.fill(
          child: IgnorePointer(child: LuxuryHotelBackdrop()),
        ),
        Positioned.fill(child: child),
      ],
    );
  }
}

class _AdminDashboardTab extends StatefulWidget {
  const _AdminDashboardTab({required this.onNavigate});

  final ValueChanged<int> onNavigate;

  @override
  State<_AdminDashboardTab> createState() => _AdminDashboardTabState();
}

class _AdminDashboardTabState extends State<_AdminDashboardTab> {
  late Future<_AdminDashboardData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_AdminDashboardData> _load() async {
    final repo = context.read<AdminRepository>();
    return _AdminDashboardData(
      await repo.getReportSummary(),
      const <AdminWorkerProfile>[],
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<_AdminDashboardData>(
      future: _future,
      onRetry: _refresh,
      builder: (data) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const _AdminWelcomePanel(),
          const SizedBox(height: 16),
          _AdminDashboardMetricGrid(dashboard: data.dashboard),
          const SizedBox(height: 16),
          _AdminActivityCard(dashboard: data.dashboard),
          const SizedBox(height: 16),
          _PendingApprovalsCard(dashboard: data.dashboard),
          const SizedBox(height: 16),
          _QuickActionsCard(onNavigate: widget.onNavigate),
          const SizedBox(height: 40),
        ],
      ),
    );
  }
}

class _AdminReportsTab extends StatefulWidget {
  const _AdminReportsTab();

  @override
  State<_AdminReportsTab> createState() => _AdminReportsTabState();
}

class _AdminReportsTabState extends State<_AdminReportsTab> {
  late Future<_AdminDashboardData> _future;
  String? _selectedWorkerId;
  DateTime? _startDate;
  DateTime? _endDate;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_AdminDashboardData> _load() async {
    final repo = context.read<AdminRepository>();
    final auth = context.read<AdminAuthController>();
    final summaryFuture = repo.getReportSummary(
      workerId: _selectedWorkerId,
      startDate: _startDate,
      endDate: _endDate,
    );
    final Future<List<AdminWorkerProfile>> workersFuture =
        auth.hasPermission('view_workers')
        ? repo
              .listWorkers(status: 'approved', limit: 100)
              .then((page) => page.data)
        : Future<List<AdminWorkerProfile>>.value(<AdminWorkerProfile>[]);
    return _AdminDashboardData(await summaryFuture, await workersFuture);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<_AdminDashboardData>(
      future: _future,
      onRetry: _refresh,
      builder: (data) => RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const _AdminReportsHero(),
            const SizedBox(height: 16),
            _AdminReportSummaryCard(summary: data.summary),
            const SizedBox(height: 12),
            _WorkerReportPanel(
              workers: data.workers,
              selectedWorkerId: _selectedWorkerId,
              startDate: _startDate,
              endDate: _endDate,
              detail: data.summary.reports.workerDetail,
              onWorkerChanged: (value) {
                setState(() {
                  _selectedWorkerId = value;
                  _future = _load();
                });
              },
              onPickStart: () => _pickDate(isStart: true),
              onPickEnd: () => _pickDate(isStart: false),
            ),
          ],
        ),
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
}

class _AdminReportsHero extends StatelessWidget {
  const _AdminReportsHero();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 26, 22, 24),
      decoration: BoxDecoration(
        color: BrandColors.primaryBurgundy,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        children: [
          Text(
            'Hesabatlar',
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: BrandColors.white,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Yalnız idarə etdiyiniz sifarişlər üzrə.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: BrandColors.accentGold,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 14),
          const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, color: BrandColors.white, size: 18),
              SizedBox(width: 8),
              Flexible(
                child: Text(
                  'Telefon və e-poçt məlumatları göstərilmir.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: BrandColors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AdminReportSummaryCard extends StatelessWidget {
  const _AdminReportSummaryCard({required this.summary});

  final AdminReportSummary summary;

  @override
  Widget build(BuildContext context) {
    final attendance = summary.reports.attendance;
    final ratings = summary.reports.ratingStats;
    return PremiumCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          _FlatMetricRow(
            label: 'Çağırılan işçi',
            value: '${attendance.totalCount}',
          ),
          _FlatMetricRow(
            label: 'Giriş edən işçi',
            value: '${attendance.openCount}',
          ),
          _FlatMetricRow(
            label: 'Çıxışını tamamlayan işçi',
            value: '${attendance.completedCount}',
          ),
          _FlatMetricRow(
            label: 'Orta reytinq',
            value: ratings.count == 0
                ? '0'
                : ratings.average.toStringAsFixed(1),
            last: true,
          ),
        ],
      ),
    );
  }
}

class _ApprovalsTab extends StatefulWidget {
  const _ApprovalsTab();

  @override
  State<_ApprovalsTab> createState() => _ApprovalsTabState();
}

class _ApprovalsTabState extends State<_ApprovalsTab> {
  late Future<_ApprovalsData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_ApprovalsData> _load() async {
    final repo = context.read<AdminRepository>();
    final auth = context.read<AdminAuthController>();
    final Future<List<AdminWorkerProfile>> workersFuture =
        auth.hasPermission('view_workers')
        ? repo.listWorkers(status: 'pending_approval').then((page) => page.data)
        : Future<List<AdminWorkerProfile>>.value(<AdminWorkerProfile>[]);
    final Future<List<AdminCompanyProfile>> companiesFuture =
        auth.hasPermission('view_companies')
        ? repo
              .listCompanies(status: 'pending_approval')
              .then((page) => page.data)
        : Future<List<AdminCompanyProfile>>.value(<AdminCompanyProfile>[]);
    final workers = await workersFuture;
    final companies = await companiesFuture;
    return _ApprovalsData(workers: workers, companies: companies);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<_ApprovalsData>(
      future: _future,
      onRetry: _refresh,
      builder: (data) => RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              AppStrings.pendingWorkers,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            if (data.workers.isEmpty)
              const InlineMessage(message: AppStrings.noPendingWorkers)
            else
              ...data.workers.map(
                (worker) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _WorkerApprovalCard(
                    worker: worker,
                    onChanged: _refresh,
                  ),
                ),
              ),
            const SizedBox(height: 18),
            Text(
              AppStrings.pendingCompanies,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            if (data.companies.isEmpty)
              const InlineMessage(message: AppStrings.noPendingCompanies)
            else
              ...data.companies.map(
                (company) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _CompanyApprovalCard(
                    company: company,
                    onChanged: _refresh,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _AdminOrdersTab extends StatefulWidget {
  const _AdminOrdersTab();

  @override
  State<_AdminOrdersTab> createState() => _AdminOrdersTabState();
}

class _AdminOrdersTabState extends State<_AdminOrdersTab> {
  late Future<MobileOrderPage> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().listOrders();
  }

  Future<void> _refresh() async {
    setState(() => _future = context.read<AdminRepository>().listOrders());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<MobileOrderPage>(
      future: _future,
      onRetry: _refresh,
      builder: (page) {
        if (page.data.isEmpty) {
          return _EmptyState(message: AppStrings.noOrders, onAction: _refresh);
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: page.data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) => _OrderCard(
              order: page.data[index],
              onTap: () => Navigator.of(context).push<void>(
                MaterialPageRoute(
                  builder: (_) =>
                      _AdminOrderDetailScreen(orderId: page.data[index].id),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _AdminOrderDetailScreen extends StatefulWidget {
  const _AdminOrderDetailScreen({required this.orderId});

  final String orderId;

  @override
  State<_AdminOrderDetailScreen> createState() =>
      _AdminOrderDetailScreenState();
}

class _AdminOrderDetailScreenState extends State<_AdminOrderDetailScreen> {
  late Future<MobileOrder> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().getOrder(widget.orderId);
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<AdminRepository>().getOrder(widget.orderId),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.details)),
      body: _AdminBackdrop(
        child: _AsyncView<MobileOrder>(
          future: _future,
          onRetry: _refresh,
          builder: (order) => RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _OrderCard(order: order),
                const SizedBox(height: 12),
                PremiumCard(
                  child: Column(
                    children: [
                      _DetailTile(AppStrings.company, order.companyName),
                      _DetailTile(
                        AppStrings.status,
                        AppStrings.statusLabel(order.status),
                      ),
                      _DetailTile(AppStrings.category, order.category),
                      _DetailTile(AppStrings.location, order.location),
                      _DetailTile(
                        AppStrings.requiredWorkers,
                        '${order.assignmentCount}/${order.requiredCount}',
                      ),
                      _DetailTile(
                        AppStrings.starts,
                        _dateText(order.startDatetime),
                      ),
                      _DetailTile(
                        AppStrings.ends,
                        _dateText(order.endDatetime),
                      ),
                      if (order.payRate != null)
                        _DetailTile(AppStrings.payRate, '${order.payRate}'),
                    ],
                  ),
                ),
                if (order.categoryItems.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  PremiumCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          AppStrings.categoryRequirements,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        ...order.categoryItems.map(
                          (item) => _DetailTile(
                            item.category,
                            '${item.assignedCount}/${item.requiredCount}',
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                PremiumCard(
                  dark: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        AppStrings.description,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              color: BrandColors.white,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        order.description.isEmpty
                            ? AppStrings.noData
                            : order.description,
                        style: const TextStyle(color: BrandColors.white),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AdminWorkerDetailScreen extends StatefulWidget {
  const _AdminWorkerDetailScreen({required this.workerId});

  final String workerId;

  @override
  State<_AdminWorkerDetailScreen> createState() =>
      _AdminWorkerDetailScreenState();
}

class _AdminWorkerDetailScreenState extends State<_AdminWorkerDetailScreen> {
  late Future<AdminWorkerProfile> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().getWorker(widget.workerId);
  }

  Future<void> _refresh() async {
    setState(
      () =>
          _future = context.read<AdminRepository>().getWorker(widget.workerId),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.workerName)),
      body: _AsyncView<AdminWorkerProfile>(
        future: _future,
        onRetry: _refresh,
        builder: (worker) => RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              PremiumHeroPanel(
                title: worker.name,
                subtitle: worker.position.isEmpty
                    ? AppStrings.worker
                    : worker.position,
                compact: true,
                trailing: StatusPill(status: worker.status),
                children: [
                  PremiumChip(
                    label: worker.workerClass ?? AppStrings.classNotSelected,
                    icon: Icons.workspace_premium_outlined,
                    dark: true,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              PremiumCard(
                child: Column(
                  children: [
                    _DetailTile(AppStrings.phoneNumber, worker.phone),
                    _DetailTile(
                      AppStrings.status,
                      AppStrings.statusLabel(worker.status),
                    ),
                    _DetailTile(
                      AppStrings.available,
                      worker.availability
                          ? AppStrings.available
                          : AppStrings.unavailable,
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

class _AdminCompanyDetailScreen extends StatefulWidget {
  const _AdminCompanyDetailScreen({required this.companyId});

  final String companyId;

  @override
  State<_AdminCompanyDetailScreen> createState() =>
      _AdminCompanyDetailScreenState();
}

class _AdminCompanyDetailScreenState extends State<_AdminCompanyDetailScreen> {
  late Future<AdminCompanyProfile> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().getCompany(widget.companyId);
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<AdminRepository>().getCompany(
        widget.companyId,
      ),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.company)),
      body: _AsyncView<AdminCompanyProfile>(
        future: _future,
        onRetry: _refresh,
        builder: (company) => RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              PremiumHeroPanel(
                title: company.name,
                subtitle: company.contactName.isEmpty
                    ? AppStrings.company
                    : company.contactName,
                compact: true,
                trailing: StatusPill(status: company.status),
              ),
              const SizedBox(height: 12),
              PremiumCard(
                child: Column(
                  children: [
                    _DetailTile(AppStrings.phoneNumber, company.phone),
                    _DetailTile(
                      AppStrings.status,
                      AppStrings.statusLabel(company.status),
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

class _AdminWorkersDirectoryTab extends StatefulWidget {
  const _AdminWorkersDirectoryTab();

  @override
  State<_AdminWorkersDirectoryTab> createState() =>
      _AdminWorkersDirectoryTabState();
}

class _AdminWorkersDirectoryTabState extends State<_AdminWorkersDirectoryTab> {
  late Future<AdminWorkerPage> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().listWorkers(limit: 100);
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<AdminRepository>().listWorkers(limit: 100),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<AdminWorkerPage>(
      future: _future,
      onRetry: _refresh,
      builder: (page) {
        if (page.data.isEmpty) {
          return _EmptyState(message: AppStrings.noData, onAction: _refresh);
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: page.data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final worker = page.data[index];
              return Premium3DCard(
                onTap: () => Navigator.of(context).push<void>(
                  MaterialPageRoute(
                    builder: (_) =>
                        _AdminWorkerDetailScreen(workerId: worker.id),
                  ),
                ),
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.badge_outlined),
                  title: Text(worker.name),
                  subtitle: Text(worker.position),
                  trailing: StatusPill(status: worker.status),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _AdminCompaniesDirectoryTab extends StatefulWidget {
  const _AdminCompaniesDirectoryTab();

  @override
  State<_AdminCompaniesDirectoryTab> createState() =>
      _AdminCompaniesDirectoryTabState();
}

class _AdminCompaniesDirectoryTabState
    extends State<_AdminCompaniesDirectoryTab> {
  late Future<AdminCompanyPage> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().listCompanies(limit: 100);
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<AdminRepository>().listCompanies(limit: 100),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<AdminCompanyPage>(
      future: _future,
      onRetry: _refresh,
      builder: (page) {
        if (page.data.isEmpty) {
          return _EmptyState(message: AppStrings.noData, onAction: _refresh);
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: page.data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final company = page.data[index];
              return Premium3DCard(
                onTap: () => Navigator.of(context).push<void>(
                  MaterialPageRoute(
                    builder: (_) =>
                        _AdminCompanyDetailScreen(companyId: company.id),
                  ),
                ),
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.business_outlined),
                  title: Text(company.name),
                  subtitle: Text(company.contactName),
                  trailing: StatusPill(status: company.status),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

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

class _AdminAttendanceTab extends StatefulWidget {
  const _AdminAttendanceTab();

  @override
  State<_AdminAttendanceTab> createState() => _AdminAttendanceTabState();
}

class _AdminAttendanceTabState extends State<_AdminAttendanceTab> {
  late Future<AttendancePage> _future;
  _AdminAttendanceFilter _filter = _AdminAttendanceFilter.today;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().listAttendance();
  }

  Future<void> _refresh() async {
    setState(() => _future = context.read<AdminRepository>().listAttendance());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<AttendancePage>(
      future: _future,
      onRetry: _refresh,
      builder: (page) {
        final attendance = _filter == _AdminAttendanceFilter.today
            ? page.data.where(_isTodayAttendance).toList()
            : page.data;
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              SizedBox(
                width: double.infinity,
                child: SegmentedButton<_AdminAttendanceFilter>(
                  expandedInsets: EdgeInsets.zero,
                  segments: const [
                    ButtonSegment(
                      value: _AdminAttendanceFilter.today,
                      label: Text(AppStrings.todayAttendance),
                    ),
                    ButtonSegment(
                      value: _AdminAttendanceFilter.all,
                      label: Text(AppStrings.allAttendance),
                    ),
                  ],
                  selected: {_filter},
                  onSelectionChanged: (value) =>
                      setState(() => _filter = value.first),
                ),
              ),
              const SizedBox(height: 12),
              if (attendance.isEmpty)
                const InlineMessage(message: AppStrings.noAttendance)
              else
                ...attendance.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _AttendanceCard(item),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

enum _AdminAttendanceFilter { today, all }

class _AdminNotificationsTab extends StatefulWidget {
  const _AdminNotificationsTab();

  @override
  State<_AdminNotificationsTab> createState() => _AdminNotificationsTabState();
}

class _AdminNotificationsTabState extends State<_AdminNotificationsTab> {
  late Future<NotificationPage> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().listNotifications();
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<AdminRepository>().listNotifications(),
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
        await context.read<AdminRepository>().markNotificationRead(item.id);
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.notificationReadFailed)),
        );
        return;
      }
    }

    if (!mounted) return;
    final auth = context.read<AdminAuthController>();
    final orderId = _metadataString(item, 'order_id');
    final workerId = _metadataString(item, 'worker_id');
    final companyId = _metadataString(item, 'company_id');
    if (orderId != null && auth.hasPermission('view_orders')) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _AdminOrderDetailScreen(orderId: orderId),
        ),
      );
    } else if (workerId != null && auth.hasPermission('view_workers')) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _AdminWorkerDetailScreen(workerId: workerId),
        ),
      );
    } else if (companyId != null && auth.hasPermission('view_companies')) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _AdminCompanyDetailScreen(companyId: companyId),
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

class _WorkerApprovalCard extends StatelessWidget {
  const _WorkerApprovalCard({required this.worker, required this.onChanged});

  final AdminWorkerProfile worker;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.person_outline_rounded,
                color: BrandColors.primaryBurgundy,
                size: 34,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      worker.name,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${worker.phone} • ${worker.position}',
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: BrandColors.darkText,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            value: worker.workerClass,
            decoration: const InputDecoration(
              labelText: AppStrings.workerClass,
            ),
            items: const [
              DropdownMenuItem<String>(
                value: null,
                child: Text(AppStrings.classNotSelected),
              ),
              DropdownMenuItem(value: 'A', child: Text('A')),
              DropdownMenuItem(value: 'B', child: Text('B')),
              DropdownMenuItem(value: 'C', child: Text('C')),
            ],
            onChanged: (value) async {
              try {
                await context.read<AdminRepository>().updateWorkerClass(
                  worker.id,
                  value,
                );
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text(AppStrings.classUpdated)),
                );
                await onChanged();
              } on ApiException catch (error) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(SnackBar(content: Text(error.message)));
              }
            },
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _rejectWorker(context, worker.id),
                  child: const Text(AppStrings.reject),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton(
                  onPressed: worker.workerClass == null
                      ? null
                      : () async {
                          final confirmed = await _confirmAction(
                            context,
                            AppStrings.approveWorkerConfirm,
                          );
                          if (!confirmed || !context.mounted) {
                            return;
                          }
                          await context.read<AdminRepository>().approveWorker(
                            worker.id,
                          );
                          await onChanged();
                        },
                  child: const Text(AppStrings.approve),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _rejectWorker(BuildContext context, String id) async {
    final reason = await _askReason(context);
    if (reason == null || reason.trim().isEmpty || !context.mounted) return;
    await context.read<AdminRepository>().rejectWorker(id, reason.trim());
    await onChanged();
  }
}

class _CompanyApprovalCard extends StatelessWidget {
  const _CompanyApprovalCard({required this.company, required this.onChanged});

  final AdminCompanyProfile company;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            company.name,
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            '${company.phone} • ${company.contactName}',
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: BrandColors.darkText),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _rejectCompany(context, company.id),
                  child: const Text(AppStrings.reject),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton(
                  onPressed: () async {
                    final confirmed = await _confirmAction(
                      context,
                      AppStrings.approveCompanyConfirm,
                    );
                    if (!confirmed || !context.mounted) {
                      return;
                    }
                    await context.read<AdminRepository>().approveCompany(
                      company.id,
                    );
                    await onChanged();
                  },
                  child: const Text(AppStrings.approve),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _rejectCompany(BuildContext context, String id) async {
    final reason = await _askReason(context);
    if (reason == null || reason.trim().isEmpty || !context.mounted) return;
    await context.read<AdminRepository>().rejectCompany(id, reason.trim());
    await onChanged();
  }
}

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

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, this.onTap});

  final MobileOrder order;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Premium3DCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  order.title,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.black,
                    fontWeight: FontWeight.w800,
                    height: 1.15,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              StatusPill(status: order.status),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            order.companyName,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            '${_orderCategorySummary(order)} • ${order.location}',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
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
    return Premium3DCard(
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(item.assignmentId),
        subtitle: Text(
          item.durationMinutes == null
              ? AppStrings.todayAttendance
              : '${item.durationMinutes} dəq',
        ),
        trailing: StatusPill(status: status),
      ),
    );
  }
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

class _AdminWelcomePanel extends StatelessWidget {
  const _AdminWelcomePanel();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 30, 24, 32),
      decoration: BoxDecoration(
        color: BrandColors.primaryBurgundy,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        children: [
          Text(
            'Admin paneli',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: BrandColors.white,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Gündəlik təsdiq və təyinat əməliyyatlarını idarə edin.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: BrandColors.accentGold,
              fontWeight: FontWeight.w500,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminDashboardMetricGrid extends StatelessWidget {
  const _AdminDashboardMetricGrid({required this.dashboard});

  final AdminReportDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          _FlatMetricRow(
            label: 'Bugünkü aktiv sifarişlər',
            value: '${dashboard.todayActiveOrders}',
          ),
          _FlatMetricRow(
            label: 'Gözləyən sifarişlər',
            value: '${dashboard.pendingOrders}',
          ),
          _FlatMetricRow(
            label: 'Aktiv təyinatlar',
            value: '${dashboard.activeAssignments}',
          ),
          _FlatMetricRow(
            label: 'Bu gün giriş edən işçilər',
            value: '${dashboard.checkedInWorkersToday}',
            last: true,
          ),
        ],
      ),
    );
  }
}

class _AdminActivityCard extends StatelessWidget {
  const _AdminActivityCard({required this.dashboard});

  final AdminReportDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(22, 22, 22, 10),
            child: _AdminCardTitle(
              icon: Icons.history_rounded,
              title: 'Son aktivlik',
            ),
          ),
          _FlatMetricRow(
            label: AppStrings.activeAssignments,
            value: '${dashboard.activeAssignments}',
          ),
          _FlatMetricRow(
            label: AppStrings.checkedInWorkersToday,
            value: '${dashboard.checkedInWorkersToday}',
          ),
          _FlatMetricRow(
            label: AppStrings.rejectedAssignments,
            value: '${dashboard.rejectedAssignments}',
            last: true,
          ),
        ],
      ),
    );
  }
}

class _PendingApprovalsCard extends StatelessWidget {
  const _PendingApprovalsCard({required this.dashboard});

  final AdminReportDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final total =
        dashboard.pendingWorkerApprovals + dashboard.pendingCompanyApprovals;
    return PremiumCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(22, 22, 22, 10),
            child: _AdminCardTitle(
              icon: Icons.hourglass_bottom_rounded,
              title: AppStrings.pendingApprovals,
            ),
          ),
          _FlatMetricRow(
            label: 'İşçi təsdiqləri',
            value: '${dashboard.pendingWorkerApprovals}',
          ),
          _FlatMetricRow(
            label: 'Müəssisə təsdiqləri',
            value: '${dashboard.pendingCompanyApprovals}',
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 12, 22, 18),
            child: Row(
              children: [
                Icon(
                  total == 0 ? Icons.check_circle_outline : Icons.error_outline,
                  color: BrandColors.primaryBurgundy,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(
                  total == 0 ? 'Təsdiq gözləmir' : '$total təsdiq gözləyir',
                  style: const TextStyle(
                    color: BrandColors.primaryBurgundy,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickActionsCard extends StatelessWidget {
  const _QuickActionsCard({required this.onNavigate});

  final ValueChanged<int> onNavigate;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AdminAuthController>();
    final actions = <_DashboardAction>[
      if (auth.hasPermission('manage_workers') ||
          auth.hasPermission('manage_companies'))
        _DashboardAction('Təsdiqlər', Icons.verified_outlined, 1),
      if (auth.hasPermission('view_orders'))
        _DashboardAction(AppStrings.orders, Icons.receipt_long_outlined, 2),
      if (auth.hasPermission('view_assignments'))
        _DashboardAction(AppStrings.assignments, Icons.assignment_outlined, 3),
      if (auth.hasPermission('view_reports'))
        _DashboardAction(AppStrings.reports, Icons.bar_chart_outlined, 7),
    ];

    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _AdminCardTitle(
            icon: Icons.flash_on_outlined,
            title: 'Sürətli keçidlər',
          ),
          const SizedBox(height: 12),
          if (actions.isEmpty)
            PremiumEmptyState(
              title: 'Keçid yoxdur',
              message: 'Bu admin üçün əlavə bölmə icazəsi təyin edilməyib.',
              icon: Icons.lock_outline,
              action: OutlinedButton.icon(
                onPressed: () => onNavigate(0),
                icon: const Icon(Icons.dashboard_outlined),
                label: const Text('Panel'),
              ),
            )
          else
            Column(
              children: actions
                  .map(
                    (action) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () => onNavigate(action.index),
                          icon: Icon(action.icon),
                          label: Text(
                            action.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
        ],
      ),
    );
  }
}

class _AdminCardTitle extends StatelessWidget {
  const _AdminCardTitle({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: BrandColors.darkText, size: 26),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

class _FlatMetricRow extends StatelessWidget {
  const _FlatMetricRow({
    required this.label,
    required this.value,
    this.last = false,
  });

  final String label;
  final String value;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 76),
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 18),
      decoration: BoxDecoration(
        border: last
            ? null
            : const Border(
                bottom: BorderSide(color: BrandColors.accentGold, width: 0.7),
              ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: BrandColors.darkText,
                fontWeight: FontWeight.w700,
                height: 1.2,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _DashboardAction {
  const _DashboardAction(this.label, this.icon, this.index);

  final String label;
  final IconData icon;
  final int index;
}

class _DetailTile extends StatelessWidget {
  const _DetailTile(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 14),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: BrandColors.accentGold, width: 0.7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 5),
          Text(
            value.isEmpty ? AppStrings.noData : value,
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: BrandColors.darkText),
          ),
        ],
      ),
    );
  }
}

class _WorkerReportPanel extends StatelessWidget {
  const _WorkerReportPanel({
    required this.workers,
    required this.selectedWorkerId,
    required this.startDate,
    required this.endDate,
    required this.detail,
    required this.onWorkerChanged,
    required this.onPickStart,
    required this.onPickEnd,
  });

  final List<AdminWorkerProfile> workers;
  final String? selectedWorkerId;
  final DateTime? startDate;
  final DateTime? endDate;
  final AdminWorkerReportDetail? detail;
  final ValueChanged<String?> onWorkerChanged;
  final VoidCallback onPickStart;
  final VoidCallback onPickEnd;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.filter_alt_outlined, size: 30),
              const SizedBox(width: 10),
              Text(
                'Filtrlər',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: selectedWorkerId,
            decoration: const InputDecoration(
              labelText: AppStrings.selectWorker,
              prefixIcon: Icon(Icons.badge_outlined),
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
            onChanged: onWorkerChanged,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onPickStart,
                  icon: const Icon(Icons.hourglass_top_rounded),
                  label: Text(_dateButtonText(AppStrings.starts, startDate)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onPickEnd,
                  icon: const Icon(Icons.hourglass_bottom_rounded),
                  label: Text(_dateButtonText(AppStrings.ends, endDate)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (selectedWorkerId == null)
            const InlineMessage(message: AppStrings.selectWorker)
          else if (detail == null)
            const InlineMessage(message: AppStrings.noData)
          else ...[
            _DetailTile(AppStrings.workerName, detail!.workerName),
            _DetailTile(
              AppStrings.workerClass,
              detail!.workerClass ?? AppStrings.classNotSelected,
            ),
            _DetailTile(AppStrings.attendance, '${detail!.workCount}'),
            _DetailTile(
              AppStrings.completedAssignments,
              '${detail!.checkoutCompletedCount}',
            ),
            _DetailTile(
              AppStrings.company,
              detail!.companyNames.isEmpty
                  ? AppStrings.noData
                  : detail!.companyNames.join(', '),
            ),
            _DetailTile(
              AppStrings.averageRating,
              '${detail!.ratingAverage.toStringAsFixed(1)} (${detail!.ratingCount})',
            ),
          ],
        ],
      ),
    );
  }

  String _dateButtonText(String label, DateTime? date) {
    if (date == null) return label;
    return '$label: ${date.day.toString().padLeft(2, '0')}.'
        '${date.month.toString().padLeft(2, '0')}.${date.year}';
  }
}

class _AdminDashboardData {
  const _AdminDashboardData(this.summary, this.workers);

  final AdminReportSummary summary;
  final List<AdminWorkerProfile> workers;

  AdminReportDashboard get dashboard => summary.dashboard;
}

class _ApprovalsData {
  const _ApprovalsData({required this.workers, required this.companies});

  final List<AdminWorkerProfile> workers;
  final List<AdminCompanyProfile> companies;
}

class _AssignmentOptions {
  const _AssignmentOptions({required this.orders, required this.workers});

  final List<MobileOrder> orders;
  final List<AdminWorkerProfile> workers;
}

MobileOrder? _findOrderById(List<MobileOrder> orders, String? id) {
  if (id == null) return null;
  for (final order in orders) {
    if (order.id == id) return order;
  }
  return null;
}

AdminWorkerProfile? _findWorkerById(
  List<AdminWorkerProfile> workers,
  String? id,
) {
  if (id == null) return null;
  for (final worker in workers) {
    if (worker.id == id) return worker;
  }
  return null;
}

MobileOrderCategoryItem? _findCategoryItemById(
  List<MobileOrderCategoryItem> items,
  String? id,
) {
  if (id == null) return null;
  for (final item in items) {
    if (item.id == id) return item;
  }
  return null;
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

bool _isTodayAttendance(AttendanceLog item) {
  final timestamp = item.checkinTime ?? item.checkoutTime;
  if (timestamp == null) {
    return false;
  }
  final local = timestamp.toLocal();
  final now = DateTime.now();
  return local.year == now.year &&
      local.month == now.month &&
      local.day == now.day;
}

String _dateText(DateTime? value) {
  if (value == null) {
    return AppStrings.noData;
  }
  return value.toLocal().toString();
}

String _notificationTitle(NotificationItem item) {
  if (item.title.trim().isNotEmpty) return item.title.trim();
  return switch (item.type) {
    'order_created' => AppStrings.createOrder,
    'worker_approved' => AppStrings.workerApprovedNotification,
    'worker_rejected' => AppStrings.workerRejectedNotification,
    'company_approved' => AppStrings.companyApprovedMessage,
    'company_rejected' => AppStrings.companyRejectedMessage,
    'job_assigned' => AppStrings.newAssignmentNotification,
    _ => AppStrings.systemNotification,
  };
}

String _notificationBody(NotificationItem item) {
  if (item.body.trim().isNotEmpty) return item.body.trim();
  return switch (item.type) {
    'worker_approved' => AppStrings.workerApprovedBody,
    'worker_rejected' => AppStrings.workerRejectedNotification,
    'company_approved' => AppStrings.companyApprovedMessage,
    'company_rejected' => AppStrings.companyRejectedMessage,
    'job_assigned' => AppStrings.jobAssignedBody,
    _ => AppStrings.systemNotification,
  };
}
