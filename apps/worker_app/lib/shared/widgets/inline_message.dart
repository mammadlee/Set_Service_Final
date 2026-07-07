import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

class InlineMessage extends StatelessWidget {
  const InlineMessage({
    required this.message,
    this.kind = InlineMessageKind.info,
    super.key,
  });

  final String message;
  final InlineMessageKind kind;

  @override
  Widget build(BuildContext context) {
    final colors = switch (kind) {
      InlineMessageKind.error => (
        bg: BrandColors.softBeige,
        fg: BrandColors.primaryBurgundy,
        icon: Icons.error_outline,
      ),
      InlineMessageKind.success => (
        bg: BrandColors.white,
        fg: BrandColors.mutedBrown,
        icon: Icons.check_circle_outline,
      ),
      InlineMessageKind.info => (
        bg: BrandColors.white,
        fg: BrandColors.darkBurgundy,
        icon: Icons.info_outline,
      ),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: BrandColors.accentGold.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(colors.icon, color: colors.fg, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: colors.fg, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

enum InlineMessageKind { info, success, error }
