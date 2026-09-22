part of 'admin_home_shell.dart';

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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AdminStatusHeader(
                      title: worker.name,
                      status: worker.status,
                      icon: Icons.badge_outlined,
                    ),
                    if (worker.position.trim().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(worker.position),
                    ],
                  ],
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AdminStatusHeader(
                      title: company.name,
                      status: company.status,
                      icon: Icons.business_outlined,
                    ),
                    if (company.contactName.trim().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(company.contactName),
                    ],
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }
}
