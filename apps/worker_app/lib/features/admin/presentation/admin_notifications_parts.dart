part of 'admin_home_shell.dart';

class _AdminNotificationsTab extends StatefulWidget {
  const _AdminNotificationsTab();

  @override
  State<_AdminNotificationsTab> createState() => _AdminNotificationsTabState();
}

class _AdminNotificationsTabState extends State<_AdminNotificationsTab> {
  late Future<NotificationPage> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().listNotifications();
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<AdminRepository>().listNotifications(),
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
        await context.read<AdminRepository>().markNotificationRead(item.id);
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(AppStrings.notificationReadFailed)),
        );
        return;
      }
    }

    if (!mounted) return;
    final auth = context.read<AdminAuthController>();
    final orderId = _metadataString(item, 'order_id');
    final workerId = _metadataString(item, 'worker_id');
    final companyId = _metadataString(item, 'company_id');
    if (orderId != null && auth.hasPermission('view_orders')) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _AdminOrderDetailScreen(orderId: orderId),
        ),
      );
    } else if (workerId != null && auth.hasPermission('view_workers')) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _AdminWorkerDetailScreen(workerId: workerId),
        ),
      );
    } else if (companyId != null && auth.hasPermission('view_companies')) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => _AdminCompanyDetailScreen(companyId: companyId),
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
