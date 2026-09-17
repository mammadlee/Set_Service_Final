part of 'company_home_shell.dart';

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StatusPill(status: status),
          const SizedBox(height: 12),
          _CompanyDetailField(
            label: item.workerName == null ? 'Təyinat' : AppStrings.worker,
            value: item.workerName ?? item.assignmentId,
          ),
          if (item.orderTitle != null)
            _CompanyDetailField(label: 'Sifariş', value: item.orderTitle!),
          _CompanyDetailField(
            label: 'Giriş vaxtı',
            value: _companyDateTime(item.checkinTime),
          ),
          if (item.checkoutTime != null)
            _CompanyDetailField(
              label: 'Çıxış vaxtı',
              value: _companyDateTime(item.checkoutTime),
            ),
          if (item.durationMinutes != null) Text('${item.durationMinutes} dəq'),
        ],
      ),
    );
  }
}
