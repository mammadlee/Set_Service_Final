import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../app_strings.dart';
import 'premium_components.dart';

class StatusPill extends StatelessWidget {
  const StatusPill({required this.status, super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final color = _colorFor(status);
    final icon = _iconFor(status);

    return AnimatedStatusChip(
      label: AppStrings.statusLabel(status),
      icon: icon,
      color: color,
    );
  }

  Color _colorFor(String value) {
    return switch (value) {
      'checked_in' ||
      'approved' ||
      'accepted' ||
      'active' => BrandColors.success,
      'pending_approval' || 'pending_otp' || 'assigned' => BrandColors.warning,
      'rejected' || 'cancelled' || 'suspended' => BrandColors.error,
      'checked_out' || 'completed' => BrandColors.primaryBurgundy,
      _ => BrandColors.mutedBrown,
    };
  }

  IconData _iconFor(String value) {
    return switch (value) {
      'assigned' => Icons.schedule_send_outlined,
      'accepted' => Icons.verified_outlined,
      'approved' || 'active' => Icons.check_circle_outline,
      'pending_approval' || 'pending_otp' => Icons.hourglass_top_outlined,
      'rejected' || 'cancelled' || 'suspended' => Icons.cancel_outlined,
      'checked_out' || 'completed' => Icons.done_all_outlined,
      'checked_in' => Icons.login_outlined,
      _ => Icons.info_outline,
    };
  }
}
