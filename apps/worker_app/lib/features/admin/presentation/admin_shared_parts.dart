part of 'admin_home_shell.dart';

class AdminStatusHeader extends StatelessWidget {
  const AdminStatusHeader({
    required this.title,
    required this.status,
    this.icon,
    this.titleStyle,
    super.key,
  });

  final String title;
  final String status;
  final IconData? icon;
  final TextStyle? titleStyle;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final heading = Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (icon != null) ...[
              Icon(icon, color: BrandColors.primaryBurgundy, size: 26),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Text(
                title,
                softWrap: true,
                style:
                    titleStyle ??
                    Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: Colors.black,
                      fontWeight: FontWeight.w800,
                    ),
              ),
            ),
          ],
        );
        final pill = ConstrainedBox(
          constraints: BoxConstraints(maxWidth: constraints.maxWidth),
          child: StatusPill(status: status),
        );
        if (constraints.maxWidth < 390) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [heading, const SizedBox(height: 10), pill],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: heading),
            const SizedBox(width: 12),
            pill,
          ],
        );
      },
    );
  }
}

class AdminActionGroup extends StatelessWidget {
  const AdminActionGroup({
    required this.actions,
    this.stackBelow = 300,
    super.key,
  });

  final List<Widget> actions;
  final double stackBelow;

  @override
  Widget build(BuildContext context) {
    if (actions.isEmpty) return const SizedBox.shrink();
    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = constraints.maxWidth < stackBelow;
        final actionWidth = stacked
            ? constraints.maxWidth
            : (constraints.maxWidth - 8 * (actions.length - 1)) /
                  actions.length;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final action in actions)
              SizedBox(width: actionWidth, child: action),
          ],
        );
      },
    );
  }
}

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

class _AssignmentOptions {
  const _AssignmentOptions({required this.orders, required this.workers});

  final List<MobileOrder> orders;
  final List<AdminWorkerProfile> workers;
}

MobileOrder? _findOrderById(List<MobileOrder> orders, String? id) {
  if (id == null) return null;
  for (final order in orders) {
    if (order.id == id) return order;
  }
  return null;
}

AdminWorkerProfile? _findWorkerById(
  List<AdminWorkerProfile> workers,
  String? id,
) {
  if (id == null) return null;
  for (final worker in workers) {
    if (worker.id == id) return worker;
  }
  return null;
}

MobileOrderCategoryItem? _findCategoryItemById(
  List<MobileOrderCategoryItem> items,
  String? id,
) {
  if (id == null) return null;
  for (final item in items) {
    if (item.id == id) return item;
  }
  return null;
}

String _orderCategorySummary(MobileOrder order) {
  if (order.categoryItems.isEmpty) {
    return '${order.category} (${order.requiredCount})';
  }
  return order.categoryItems
      .map(
        (item) =>
            '${item.category} (${item.assignedCount}/${item.requiredCount})',
      )
      .join(', ');
}

bool _isTodayAttendance(AttendanceLog item) {
  final timestamp = item.checkinTime ?? item.checkoutTime;
  if (timestamp == null) {
    return false;
  }
  final local = timestamp.toLocal();
  final now = DateTime.now();
  return local.year == now.year &&
      local.month == now.month &&
      local.day == now.day;
}

String _dateText(DateTime? value) {
  if (value == null) {
    return AppStrings.noData;
  }
  return value.toLocal().toString();
}

String _notificationTitle(NotificationItem item) {
  if (item.title.trim().isNotEmpty) return item.title.trim();
  return switch (item.type) {
    'order_created' => AppStrings.createOrder,
    'worker_approved' => AppStrings.workerApprovedNotification,
    'worker_rejected' => AppStrings.workerRejectedNotification,
    'company_approved' => AppStrings.companyApprovedMessage,
    'company_rejected' => AppStrings.companyRejectedMessage,
    'job_assigned' => AppStrings.newAssignmentNotification,
    _ => AppStrings.systemNotification,
  };
}

String _notificationBody(NotificationItem item) {
  if (item.body.trim().isNotEmpty) return item.body.trim();
  return switch (item.type) {
    'worker_approved' => AppStrings.workerApprovedBody,
    'worker_rejected' => AppStrings.workerRejectedNotification,
    'company_approved' => AppStrings.companyApprovedMessage,
    'company_rejected' => AppStrings.companyRejectedMessage,
    'job_assigned' => AppStrings.jobAssignedBody,
    _ => AppStrings.systemNotification,
  };
}
