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
