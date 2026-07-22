part of 'admin_home_shell.dart';

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

class _AdminDashboardData {
  const _AdminDashboardData(this.summary, this.workers);

  final AdminReportSummary summary;
  final List<AdminWorkerProfile> workers;

  AdminReportDashboard get dashboard => summary.dashboard;
}
