part of 'company_home_shell.dart';

class _CompanyNotificationsTab extends StatefulWidget {
  const _CompanyNotificationsTab({required this.attendanceCache});

  final _CompanyAttendanceStatusCache attendanceCache;

  @override
  State<_CompanyNotificationsTab> createState() =>
      _CompanyNotificationsTabState();
}

class _CompanyNotificationsTabState extends State<_CompanyNotificationsTab> {
  late Future<NotificationPage> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<CompanyRepository>().listNotifications();
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<CompanyRepository>().listNotifications(),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<NotificationPage>(
      future: _future,
      onRetry: _refresh,
      builder: (page) {
        if (page.data.isEmpty) {
          return _EmptyState(
            message: AppStrings.noNotifications,
            onAction: _refresh,
          );
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: page.data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, index) {
              final item = page.data[index];
              return NotificationCard(
                notification: item,
                title: _notificationTitle(item),
                body: _notificationBody(item),
                onTap: () => _openNotification(item),
              );
            },
          ),
        );
      },
    );
  }

  Future<void> _openNotification(NotificationItem item) async {
    if (item.isUnread) {
      try {
        await context.read<CompanyRepository>().markNotificationRead(item.id);
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.notificationReadFailed)),
        );
        return;
      }
    }

    if (!mounted) return;
    final orderId = _metadataString(item, 'order_id');
    final workerId = _metadataString(item, 'worker_id');

    if (orderId != null) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _CompanyOrderDetailScreen(
            orderId: orderId,
            attendanceCache: widget.attendanceCache,
          ),
        ),
      );
    } else if (workerId != null) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _CompanyWorkerProfileScreen(workerId: workerId),
        ),
      );
    } else {
      await showNotificationDetailSheet(
        context: context,
        notification: item,
        title: _notificationTitle(item),
        body: _notificationBody(item),
      );
    }
    if (mounted) await _refresh();
  }

  String? _metadataString(NotificationItem item, String key) {
    final value = item.metadata[key];
    if (value is String && value.trim().isNotEmpty) return value.trim();
    return null;
  }
}
