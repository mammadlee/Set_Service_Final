part of 'company_home_shell.dart';

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
                subtitle: 'Müəssisə idarə paneli',
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
