part of 'admin_home_shell.dart';

class _ApprovalsTab extends StatefulWidget {
  const _ApprovalsTab();

  @override
  State<_ApprovalsTab> createState() => _ApprovalsTabState();
}

class _ApprovalsTabState extends State<_ApprovalsTab> {
  late Future<_ApprovalsData> _future;
  final Set<String> _resolvedWorkerIds = <String>{};
  final Set<String> _resolvedCompanyIds = <String>{};

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
    final workers = (await workersFuture)
        .where((worker) => worker.status == 'pending_approval')
        .toList(growable: false);
    final companies = (await companiesFuture)
        .where((company) => company.status == 'pending_approval')
        .toList(growable: false);
    return _ApprovalsData(workers: workers, companies: companies);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  Future<void> _resolveWorker(String id) async {
    if (!mounted) return;
    setState(() => _resolvedWorkerIds.add(id));
    await _syncAfterMutation();
  }

  Future<void> _resolveCompany(String id) async {
    if (!mounted) return;
    setState(() => _resolvedCompanyIds.add(id));
    await _syncAfterMutation();
  }

  Future<void> _syncAfterMutation() async {
    try {
      final updated = await _load();
      if (!mounted) return;
      setState(() => _future = Future<_ApprovalsData>.value(updated));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(AppStrings.loadFailed)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<_ApprovalsData>(
      future: _future,
      onRetry: _refresh,
      builder: (data) {
        final workers = data.workers
            .where((worker) => !_resolvedWorkerIds.contains(worker.id))
            .toList(growable: false);
        final companies = data.companies
            .where((company) => !_resolvedCompanyIds.contains(company.id))
            .toList(growable: false);
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                AppStrings.pendingWorkers,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (workers.isEmpty)
                const InlineMessage(message: AppStrings.noPendingWorkers)
              else
                ...workers.map(
                  (worker) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AdminWorkerApprovalCard(
                      worker: worker,
                      onResolved: _resolveWorker,
                    ),
                  ),
                ),
              const SizedBox(height: 18),
              Text(
                AppStrings.pendingCompanies,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (companies.isEmpty)
                const InlineMessage(message: AppStrings.noPendingCompanies)
              else
                ...companies.map(
                  (company) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _CompanyApprovalCard(
                      company: company,
                      onResolved: _resolveCompany,
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class AdminWorkerApprovalCard extends StatefulWidget {
  const AdminWorkerApprovalCard({
    required this.worker,
    required this.onResolved,
    super.key,
  });

  final AdminWorkerProfile worker;
  final Future<void> Function(String id) onResolved;

  @override
  State<AdminWorkerApprovalCard> createState() =>
      _AdminWorkerApprovalCardState();
}

class _AdminWorkerApprovalCardState extends State<AdminWorkerApprovalCard> {
  bool _submitting = false;
  String? _selectedClass;

  @override
  void initState() {
    super.initState();
    _selectedClass = widget.worker.workerClass;
  }

  @override
  void didUpdateWidget(covariant AdminWorkerApprovalCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.worker.id != widget.worker.id ||
        oldWidget.worker.workerClass != widget.worker.workerClass) {
      _selectedClass = widget.worker.workerClass;
    }
  }

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
                      widget.worker.name,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${widget.worker.phone} • ${widget.worker.position}',
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
            value: _selectedClass,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: AppStrings.workerClass,
              helperText:
                  'Məcburi deyil. “Sonra təyin et” seçimi ilə də təsdiqləyə bilərsiniz.',
              helperMaxLines: 2,
            ),
            items: const [
              DropdownMenuItem<String>(
                value: null,
                child: Text('Sonra təyin et'),
              ),
              DropdownMenuItem(value: 'A', child: Text('A')),
              DropdownMenuItem(value: 'B', child: Text('B')),
              DropdownMenuItem(value: 'C', child: Text('C')),
            ],
            onChanged: _submitting
                ? null
                : (value) => setState(() => _selectedClass = value),
          ),
          const SizedBox(height: 16),
          AdminActionGroup(
            actions: [
              OutlinedButton(
                onPressed: _submitting ? null : _rejectWorker,
                child: const Text(AppStrings.reject),
              ),
              ElevatedButton(
                onPressed: _submitting ? null : _approveWorker,
                child: _submitting
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text(AppStrings.approve),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _approveWorker() async {
    final confirmed = await _confirmAction(
      context,
      AppStrings.approveWorkerConfirm,
    );
    if (!confirmed || !mounted) return;
    setState(() => _submitting = true);
    try {
      final approved = await context.read<AdminRepository>().approveWorker(
        widget.worker.id,
        workerClass: _selectedClass,
      );
      if (approved.status != 'approved') {
        throw const ApiException(message: AppStrings.actionFailed);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('İşçi təsdiqləndi.')));
      await widget.onResolved(widget.worker.id);
    } on ApiException catch (error) {
      if (!mounted) return;
      _showApprovalError(context, error.message);
    } catch (_) {
      if (!mounted) return;
      _showApprovalError(context, AppStrings.actionFailed);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _rejectWorker() async {
    final repository = context.read<AdminRepository>();
    final reason = await _askReason(context);
    if (!mounted || reason == null || reason.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      final rejected = await repository.rejectWorker(
        widget.worker.id,
        reason.trim(),
      );
      if (rejected.status != 'rejected') {
        throw const ApiException(message: AppStrings.actionFailed);
      }
      if (!mounted) return;
      await widget.onResolved(widget.worker.id);
    } on ApiException catch (error) {
      if (!mounted) return;
      _showApprovalError(context, error.message);
    } catch (_) {
      if (!mounted) return;
      _showApprovalError(context, AppStrings.actionFailed);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _CompanyApprovalCard extends StatefulWidget {
  const _CompanyApprovalCard({required this.company, required this.onResolved});

  final AdminCompanyProfile company;
  final Future<void> Function(String id) onResolved;

  @override
  State<_CompanyApprovalCard> createState() => _CompanyApprovalCardState();
}

class _CompanyApprovalCardState extends State<_CompanyApprovalCard> {
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.company.name,
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            '${widget.company.phone} • ${widget.company.contactName}',
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: BrandColors.darkText),
          ),
          const SizedBox(height: 16),
          AdminActionGroup(
            actions: [
              OutlinedButton(
                onPressed: _submitting ? null : _rejectCompany,
                child: const Text(AppStrings.reject),
              ),
              ElevatedButton(
                onPressed: _submitting ? null : _approveCompany,
                child: _submitting
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text(AppStrings.approve),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _approveCompany() async {
    final confirmed = await _confirmAction(
      context,
      AppStrings.approveCompanyConfirm,
    );
    if (!confirmed || !mounted) return;
    setState(() => _submitting = true);
    try {
      final approved = await context.read<AdminRepository>().approveCompany(
        widget.company.id,
      );
      if (approved.status != 'approved') {
        throw const ApiException(message: AppStrings.actionFailed);
      }
      if (!mounted) return;
      await widget.onResolved(widget.company.id);
    } on ApiException catch (error) {
      if (!mounted) return;
      _showApprovalError(context, error.message);
    } catch (_) {
      if (!mounted) return;
      _showApprovalError(context, AppStrings.actionFailed);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _rejectCompany() async {
    final repository = context.read<AdminRepository>();
    final reason = await _askReason(context);
    if (!mounted || reason == null || reason.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      final rejected = await repository.rejectCompany(
        widget.company.id,
        reason.trim(),
      );
      if (rejected.status != 'rejected') {
        throw const ApiException(message: AppStrings.actionFailed);
      }
      if (!mounted) return;
      await widget.onResolved(widget.company.id);
    } on ApiException catch (error) {
      if (!mounted) return;
      _showApprovalError(context, error.message);
    } catch (_) {
      if (!mounted) return;
      _showApprovalError(context, AppStrings.actionFailed);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

void _showApprovalError(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), backgroundColor: BrandColors.error),
  );
}

class _WorkerClassEditor extends StatefulWidget {
  const _WorkerClassEditor({required this.worker, required this.onUpdated});

  final AdminWorkerProfile worker;
  final Future<void> Function(AdminWorkerProfile worker) onUpdated;

  @override
  State<_WorkerClassEditor> createState() => _WorkerClassEditorState();
}

class _WorkerClassEditorState extends State<_WorkerClassEditor> {
  String? _value;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _value = widget.worker.workerClass;
  }

  @override
  void didUpdateWidget(covariant _WorkerClassEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_saving &&
        (oldWidget.worker.id != widget.worker.id ||
            oldWidget.worker.workerClass != widget.worker.workerClass)) {
      _value = widget.worker.workerClass;
    }
  }

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      value: _value,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: AppStrings.workerClass,
        helperText: _saving
            ? 'Yadda saxlanılır…'
            : 'Sinfi istənilən vaxt dəyişə bilərsiniz.',
        helperMaxLines: 2,
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
      onChanged: _saving ? null : _update,
    );
  }

  Future<void> _update(String? value) async {
    final previous = _value;
    setState(() {
      _value = value;
      _saving = true;
    });
    try {
      final updated = await context.read<AdminRepository>().updateWorkerClass(
        widget.worker.id,
        value,
      );
      if (updated.workerClass != value) {
        throw const ApiException(message: AppStrings.actionFailed);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text(AppStrings.classUpdated)));
      await widget.onUpdated(updated);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _value = previous);
      _showApprovalError(context, error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _value = previous);
      _showApprovalError(context, AppStrings.actionFailed);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _ApprovalsData {
  const _ApprovalsData({required this.workers, required this.companies});

  final List<AdminWorkerProfile> workers;
  final List<AdminCompanyProfile> companies;
}
