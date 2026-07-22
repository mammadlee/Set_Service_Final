part of 'company_home_shell.dart';

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
