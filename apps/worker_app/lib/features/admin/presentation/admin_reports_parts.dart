part of 'admin_home_shell.dart';

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
