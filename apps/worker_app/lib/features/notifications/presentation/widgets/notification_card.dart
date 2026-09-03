import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../data/models/notification_item.dart';

class NotificationCard extends StatelessWidget {
  const NotificationCard({
    required this.notification,
    required this.title,
    required this.body,
    required this.onTap,
    super.key,
  });

  final NotificationItem notification;
  final String title;
  final String body;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd.MM, HH:mm');
    final compact = MediaQuery.sizeOf(context).width < 380;

    return Premium3DCard(
      onTap: onTap,
      padding: EdgeInsets.all(compact ? 16 : 20),
      radius: 28,
      depth: notification.isUnread ? 1.05 : 0.82,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _NotificationIcon(unread: notification.isUnread),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Colors.black,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  body,
                  maxLines: compact ? 5 : 4,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: BrandColors.mutedBrown,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      notification.isUnread
                          ? AppStrings.notificationUnread
                          : AppStrings.notificationRead,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: BrandColors.darkText,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (notification.createdAt != null)
                      Text(
                        dateFormat.format(notification.createdAt!),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: BrandColors.darkText,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationIcon extends StatefulWidget {
  const _NotificationIcon({required this.unread});

  final bool unread;

  @override
  State<_NotificationIcon> createState() => _NotificationIconState();
}

class _NotificationIconState extends State<_NotificationIcon>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final icon = SizedBox(
      width: 42,
      height: 42,
      child: Icon(
        widget.unread
            ? Icons.notifications_active_outlined
            : Icons.notifications_none_outlined,
        color: widget.unread
            ? BrandColors.primaryBurgundy
            : BrandColors.mutedBrown,
        size: 30,
      ),
    );

    if (!widget.unread) return icon;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: 1 + _controller.value * 0.04,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              child!,
              Positioned(
                right: -2,
                top: -2,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: BrandColors.accentGold.withValues(
                      alpha: 0.55 + _controller.value * 0.35,
                    ),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ],
          ),
        );
      },
      child: icon,
    );
  }
}

Future<void> showNotificationDetailSheet({
  required BuildContext context,
  required NotificationItem notification,
  required String title,
  required String body,
}) {
  final dateFormat = DateFormat('dd.MM.yyyy, HH:mm');
  return showPremiumBottomSheet<void>(
    context: context,
    title: AppStrings.notificationDetail,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: PremiumChip(
            label: notification.isUnread
                ? AppStrings.notificationUnread
                : AppStrings.notificationRead,
            icon: Icons.notifications_outlined,
          ),
        ),
        const SizedBox(height: 14),
        PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                softWrap: true,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Text(
                body,
                softWrap: true,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: BrandColors.mutedBrown,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 14),
              _DetailLine(
                label: AppStrings.notificationType,
                value: _typeLabel(notification),
              ),
              if (notification.createdAt != null)
                _DetailLine(
                  label: AppStrings.notificationSentAt,
                  value: dateFormat.format(notification.createdAt!),
                ),
              const _DetailLine(
                label: AppStrings.details,
                value: AppStrings.notificationOpenUnavailable,
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _DetailLine extends StatelessWidget {
  const _DetailLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stacked = constraints.maxWidth < 300;
          final labelWidget = Text(
            label,
            style: const TextStyle(
              color: BrandColors.mutedBrown,
              fontWeight: FontWeight.w700,
            ),
          );
          final valueWidget = Text(
            value,
            softWrap: true,
            style: const TextStyle(fontWeight: FontWeight.w600),
          );

          if (stacked) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                labelWidget,
                const SizedBox(height: 3),
                valueWidget,
              ],
            );
          }

          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(width: 112, child: labelWidget),
              const SizedBox(width: 8),
              Expanded(child: valueWidget),
            ],
          );
        },
      ),
    );
  }
}

String _typeLabel(NotificationItem item) {
  return switch (item.type) {
    'job_assigned' => AppStrings.totalAssignments,
    'worker_approved' || 'company_approved' => AppStrings.approve,
    'worker_rejected' || 'company_rejected' => AppStrings.reject,
    'attendance_checked_in' ||
    'attendance_checked_out' => AppStrings.attendance,
    'new_order' => AppStrings.orders,
    _ => AppStrings.systemNotification,
  };
}
