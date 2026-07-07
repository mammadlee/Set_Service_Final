import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../../../shared/widgets/status_pill.dart';
import '../../data/models/assignment.dart';

class AssignmentCard extends StatelessWidget {
  const AssignmentCard({
    required this.assignment,
    required this.onTap,
    super.key,
  });

  final Assignment assignment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd.MM, HH:mm');
    final statusHelp = AppStrings.assignmentStatusHelp(assignment.status);

    return Premium3DCard(
      onTap: onTap,
      padding: const EdgeInsets.all(24),
      radius: 28,
      depth: 0.95,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  assignment.order.company.name,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: BrandColors.darkText,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              StatusPill(status: assignment.status),
            ],
          ),
          const SizedBox(height: 10),
          if (statusHelp != null) ...[
            Text(
              statusHelp,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: BrandColors.darkText,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 16),
          ],
          _MetaRow(icon: Icons.place_outlined, text: assignment.order.location),
          if (assignment.order.startDatetime != null) ...[
            const SizedBox(height: 6),
            _MetaRow(
              icon: Icons.schedule_outlined,
              text:
                  '${dateFormat.format(assignment.order.startDatetime!)}'
                  '${assignment.order.endDatetime == null ? '' : ' - ${dateFormat.format(assignment.order.endDatetime!)}'}',
            ),
          ],
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: BrandColors.primaryBurgundy),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text.isEmpty ? '-' : text,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: BrandColors.primaryBurgundy,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}
