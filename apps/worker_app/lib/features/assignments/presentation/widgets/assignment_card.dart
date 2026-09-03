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
      padding: EdgeInsets.all(MediaQuery.sizeOf(context).width < 380 ? 18 : 24),
      radius: 28,
      depth: 0.95,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final narrow = constraints.maxWidth < 300;
              final title = Text(
                assignment.order.company.name,
                maxLines: narrow ? 3 : 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: BrandColors.darkText,
                  fontWeight: FontWeight.w800,
                ),
              );

              if (narrow) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    title,
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: StatusPill(status: assignment.status),
                    ),
                  ],
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: title),
                  const SizedBox(width: 12),
                  Flexible(
                    child: Align(
                      alignment: Alignment.topRight,
                      child: StatusPill(status: assignment.status),
                    ),
                  ),
                ],
              );
            },
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
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(icon, size: 20, color: BrandColors.primaryBurgundy),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text.isEmpty ? '-' : text,
            softWrap: true,
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
