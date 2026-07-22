part of 'admin_home_shell.dart';

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

class _ApprovalsData {
  const _ApprovalsData({required this.workers, required this.companies});

  final List<AdminWorkerProfile> workers;
  final List<AdminCompanyProfile> companies;
}
