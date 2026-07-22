part of 'company_home_shell.dart';

class _CompanyAssignmentsTab extends StatefulWidget {
  const _CompanyAssignmentsTab({required this.attendanceCache});

  final _CompanyAttendanceStatusCache attendanceCache;

  @override
  State<_CompanyAssignmentsTab> createState() => _CompanyAssignmentsTabState();
}

class _CompanyAssignmentsTabState extends State<_CompanyAssignmentsTab> {
  late Future<_CompanyAssignmentsData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_CompanyAssignmentsData> _load({
    bool refreshAttendance = false,
  }) async {
    final repo = context.read<CompanyRepository>();
    final assignments = await repo.listAssignments();
    final completedAttendanceIds = await widget.attendanceCache
        .loadCompletedIds(
          repo,
          assignments.data,
          forceRefresh: refreshAttendance,
        );

    return _CompanyAssignmentsData(
      assignments: assignments,
      completedAttendanceIds: completedAttendanceIds,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load(refreshAttendance: true));
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<_CompanyAssignmentsData>(
      future: _future,
      onRetry: _refresh,
      builder: (data) {
        if (data.assignments.data.isEmpty) {
          return _EmptyState(
            message: AppStrings.noAssignments,
            onAction: _refresh,
          );
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: data.assignments.data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, index) {
              final assignment = data.assignments.data[index];
              return _AssignmentCard(
                assignment,
                checkoutCompleted: data.completedAttendanceIds.contains(
                  assignment.id,
                ),
              );
            },
          ),
        );
      },
    );
  }
}
