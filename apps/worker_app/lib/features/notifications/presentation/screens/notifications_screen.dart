import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../data/models/notification_item.dart';
import '../../data/notification_repository.dart';
import '../widgets/notification_card.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late Future<NotificationPage> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<NotificationPage> _load() {
    return context.read<NotificationRepository>().listNotifications();
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedPage(
      showBackdrop: true,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: FutureBuilder<NotificationPage>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const PremiumListSkeleton();
          }

          if (snapshot.hasError) {
            final error = snapshot.error;
            final message = error is ApiException
                ? error.message
                : AppStrings.notificationsLoadFailed;
            return ListView(
              children: [
                const SizedBox(height: 80),
                InlineMessage(message: message, kind: InlineMessageKind.error),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _refresh,
                  icon: const Icon(Icons.refresh),
                  label: const Text(AppStrings.tryAgain),
                ),
              ],
            );
          }

          final notifications =
              snapshot.data?.data ?? const <NotificationItem>[];
          if (notifications.isEmpty) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                children: [
                  const SizedBox(height: 80),
                  PremiumEmptyState(
                    title: AppStrings.noNotifications,
                    message: AppStrings.noNotificationsPremium,
                    icon: Icons.notifications_none,
                    action: OutlinedButton.icon(
                      onPressed: _refresh,
                      icon: const Icon(Icons.refresh),
                      label: const Text(AppStrings.tryAgain),
                    ),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.separated(
              itemCount: notifications.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final notification = notifications[index];
                return NotificationCard(
                  notification: notification,
                  title: _title(notification),
                  body: _body(notification),
                  onTap: () => _openNotification(notification),
                );
              },
            ),
          );
        },
      ),
    );
  }

  Future<bool> _markRead(NotificationItem item) async {
    if (!item.isUnread) return true;
    try {
      await context.read<NotificationRepository>().markRead(item.id);
      return true;
    } catch (_) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(AppStrings.notificationReadFailed)),
      );
      return false;
    }
  }

  Future<void> _openNotification(NotificationItem item) async {
    final marked = await _markRead(item);
    if (!marked || !mounted) return;

    final assignmentId = _metadataString(item, 'assignment_id');
    if (assignmentId != null) {
      await Navigator.of(
        context,
      ).pushNamed(AppRoutes.assignmentDetail, arguments: assignmentId);
    } else {
      await showNotificationDetailSheet(
        context: context,
        notification: item,
        title: _title(item),
        body: _body(item),
      );
    }

    if (mounted) await _refresh();
  }

  String _title(NotificationItem notification) {
    return switch (notification.type) {
      'job_assigned' => AppStrings.newAssignmentNotification,
      'worker_approved' => AppStrings.workerApprovedNotification,
      'worker_rejected' => AppStrings.workerRejectedNotification,
      'system' => AppStrings.systemNotification,
      _ =>
        notification.title.trim().isEmpty
            ? AppStrings.notifications
            : notification.title,
    };
  }

  String _body(NotificationItem notification) {
    return switch (notification.type) {
      'job_assigned' => AppStrings.jobAssignedBody,
      'worker_approved' => AppStrings.workerApprovedBody,
      'worker_rejected' => AppStrings.rejectedMessage,
      _ =>
        notification.body.trim().isEmpty
            ? AppStrings.noData
            : notification.body,
    };
  }

  String? _metadataString(NotificationItem item, String key) {
    final value = item.metadata[key];
    if (value is String && value.trim().isNotEmpty) return value.trim();
    return null;
  }
}
