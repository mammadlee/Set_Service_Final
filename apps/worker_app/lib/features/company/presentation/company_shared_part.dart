part of 'company_home_shell.dart';

class _AsyncView<T> extends StatelessWidget {
  const _AsyncView({
    required this.future,
    required this.builder,
    required this.onRetry,
  });

  final Future<T> future;
  final Widget Function(T data) builder;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const ConstrainedPage(child: PremiumListSkeleton());
        }
        if (snapshot.hasError) {
          final error = snapshot.error;
          return ConstrainedPage(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                InlineMessage(
                  message: error is ApiException
                      ? error.message
                      : AppStrings.loadFailed,
                  kind: InlineMessageKind.error,
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text(AppStrings.tryAgain),
                ),
              ],
            ),
          );
        }
        return builder(snapshot.data as T);
      },
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message, this.onAction});

  final String message;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return ConstrainedPage(
      child: PremiumEmptyState(
        title: AppStrings.elegantEmptyTitle,
        message: message,
        icon: Icons.inbox_outlined,
        action: onAction == null
            ? null
            : OutlinedButton.icon(
                onPressed: onAction,
                icon: const Icon(Icons.refresh),
                label: const Text(AppStrings.tryAgain),
              ),
      ),
    );
  }
}

class _ActivityEmptyState extends StatelessWidget {
  const _ActivityEmptyState({required this.onRetry});

  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return ConstrainedPage(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.person_off_outlined,
            size: 82,
            color: BrandColors.accentGold,
          ),
          const SizedBox(height: 28),
          Text(
            'Hələ məlumat yoxdur',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.displaySmall?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Yenidən cəhd et'),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({required this.items});

  final List<_SummaryItem> items;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 520 ? 2 : 1;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: items.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            mainAxisExtent: 112,
          ),
          itemBuilder: (context, index) {
            final item = items[index];
            return PremiumEntrance(
              delay: Duration(milliseconds: 70 * index),
              offset: const Offset(0, 10),
              child: Premium3DCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 18,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.label,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Text(
                      '${item.value}',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _SummaryItem {
  const _SummaryItem(this.label, this.value);

  final String label;
  final int value;
}

Future<bool> _confirmAction(BuildContext context, String message) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text(AppStrings.confirmActionTitle),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text(AppStrings.cancel),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text(AppStrings.confirm),
        ),
      ],
    ),
  );
  return result == true;
}

String _notificationTitle(NotificationItem item) {
  if (item.title.trim().isNotEmpty) return item.title.trim();
  return switch (item.type) {
    'order_created' => AppStrings.createOrder,
    'company_approved' => AppStrings.companyRole,
    'company_rejected' => AppStrings.accountUnavailableTitle,
    'job_assigned' => AppStrings.newAssignmentNotification,
    _ => AppStrings.systemNotification,
  };
}

String _notificationBody(NotificationItem item) {
  if (item.body.trim().isNotEmpty) return item.body.trim();
  return switch (item.type) {
    'company_approved' => AppStrings.companyApprovedMessage,
    'company_rejected' => AppStrings.companyRejectedMessage,
    'job_assigned' => AppStrings.jobAssignedBody,
    _ => AppStrings.systemNotification,
  };
}

class _CompanyDashboardData {
  const _CompanyDashboardData({
    required this.company,
    required this.orders,
    required this.assignments,
    required this.attendance,
  });

  final MobileCompanyProfile company;
  final List<MobileOrder> orders;
  final List<Assignment> assignments;
  final List<AttendanceLog> attendance;
}

class _CompanyOrderDetailData {
  const _CompanyOrderDetailData({
    required this.order,
    required this.assignments,
    required this.completedAttendanceIds,
  });

  final MobileOrder order;
  final List<Assignment> assignments;
  final Set<String> completedAttendanceIds;
}

class _CompanyAssignmentsData {
  const _CompanyAssignmentsData({
    required this.assignments,
    required this.completedAttendanceIds,
  });

  final AssignmentPage assignments;
  final Set<String> completedAttendanceIds;
}

bool _isPotentiallyRateableAssignment(Assignment assignment) {
  return assignment.status == 'accepted' || assignment.status == 'completed';
}

class _CompanyAttendanceStatusCache {
  static const _allAssignmentsScope = 'all';

  final Map<String, Set<String>> _completedIdsByScope = <String, Set<String>>{};
  final Map<String, Future<Set<String>>> _inFlight =
      <String, Future<Set<String>>>{};

  Future<Set<String>> loadCompletedIds(
    CompanyRepository repo,
    List<Assignment> assignments, {
    String? orderId,
    bool forceRefresh = false,
  }) async {
    final scope = orderId ?? _allAssignmentsScope;
    final candidates = assignments
        .where(_isPotentiallyRateableAssignment)
        .toList(growable: false);

    if (forceRefresh) _completedIdsByScope.remove(scope);
    final completedIds = await _loadScope(repo, scope, orderId: orderId);

    return candidates
        .where((assignment) => completedIds.contains(assignment.id))
        .map((assignment) => assignment.id)
        .toSet();
  }

  Future<Set<String>> _loadScope(
    CompanyRepository repo,
    String scope, {
    String? orderId,
  }) {
    final cached = _completedIdsByScope[scope];
    if (cached != null) return Future<Set<String>>.value(cached);

    return _inFlight.putIfAbsent(scope, () async {
      try {
        const pageSize = 100;
        var page = 1;
        final completedIds = <String>{};
        while (true) {
          final attendance = await repo.listAttendance(
            orderId: orderId,
            limit: pageSize,
            page: page,
          );
          completedIds.addAll(
            attendance.data
                .where((item) => item.checkoutTime != null)
                .map((item) => item.assignmentId),
          );
          if (attendance.data.length < pageSize) break;
          page += 1;
        }
        _completedIdsByScope[scope] = completedIds;
        return completedIds;
      } finally {
        _inFlight.remove(scope);
      }
    });
  }
}
