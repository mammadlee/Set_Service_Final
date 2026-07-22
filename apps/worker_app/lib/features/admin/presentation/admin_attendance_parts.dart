part of 'admin_home_shell.dart';

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
