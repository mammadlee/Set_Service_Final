import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../../../shared/widgets/status_pill.dart';
import '../../../../shared/widgets/worker_avatar.dart';
import '../../../assignments/data/assignment_repository.dart';
import '../../../assignments/data/models/assignment.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../auth/presentation/controllers/auth_controller.dart';

class WorkerDashboardScreen extends StatefulWidget {
  const WorkerDashboardScreen({super.key});

  @override
  State<WorkerDashboardScreen> createState() => _WorkerDashboardScreenState();
}

class _WorkerDashboardScreenState extends State<WorkerDashboardScreen> {
  late Future<_DashboardData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_DashboardData> _load() async {
    final assignmentRepository = context.read<AssignmentRepository>();
    final workerFuture = context.read<AuthController>().refreshWorkerProfile();
    final assignmentsFuture = assignmentRepository.listAssignments();
    final worker = await workerFuture;
    final assignments = await assignmentsFuture;
    return _DashboardData(worker: worker, assignments: assignments.data);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedPage(
      showBackdrop: true,
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: FutureBuilder<_DashboardData>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const _DashboardSkeleton();
          }

          if (snapshot.hasError) {
            final error = snapshot.error;
            final message = error is ApiException
                ? error.message
                : AppStrings.dashboardLoadFailed;
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

          final data = snapshot.data!;
          final worker = context.watch<AuthController>().worker ?? data.worker;
          return WorkerDashboardContent(
            worker: worker,
            assignments: data.assignments,
            onRefresh: _refresh,
          );
        },
      ),
    );
  }
}

class WorkerDashboardContent extends StatelessWidget {
  const WorkerDashboardContent({
    required this.worker,
    required this.assignments,
    required this.onRefresh,
    super.key,
  });

  final WorkerMe worker;
  final List<Assignment> assignments;
  final RefreshCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          PremiumEntrance(child: WorkerIdentityCard(worker: worker)),
          const SizedBox(height: 16),
          PremiumEntrance(
            delay: const Duration(milliseconds: 90),
            child: _SummaryGrid(assignments: assignments),
          ),
          const SizedBox(height: 18),
          PremiumEntrance(
            delay: const Duration(milliseconds: 190),
            child: _NextJobCard(assignments: assignments),
          ),
        ],
      ),
    );
  }
}

class WorkerIdentityCard extends StatelessWidget {
  const WorkerIdentityCard({required this.worker, super.key});

  final WorkerMe worker;

  @override
  Widget build(BuildContext context) {
    final cleanName = worker.name.trim();
    final displayName = cleanName.isEmpty ? AppStrings.worker : cleanName;

    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 340;
        final avatarRadius = compact ? 34.0 : 39.0;
        final position = worker.positions.isNotEmpty
            ? worker.positions.join(', ')
            : worker.position?.trim().isNotEmpty == true
            ? worker.position!.trim()
            : AppStrings.worker;

        return Container(
          key: const ValueKey('worker-dashboard-identity'),
          padding: EdgeInsets.all(compact ? 16 : 20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [BrandColors.primaryBurgundy, BrandColors.deepBurgundy],
            ),
            borderRadius: BorderRadius.circular(26),
            border: Border.all(
              color: BrandColors.accentGold.withValues(alpha: 0.48),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  WorkerAvatar(
                    radius: avatarRadius,
                    name: displayName,
                    photoUrl: worker.profilePhotoUrl,
                    backgroundColor: BrandColors.white.withValues(alpha: 0.16),
                    foregroundColor: BrandColors.white,
                    borderColor: BrandColors.accentGold,
                  ),
                  const SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Xoş gəldiniz',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: BrandColors.white.withValues(
                                  alpha: 0.82,
                                ),
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          displayName,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.headlineSmall
                              ?.copyWith(
                                color: BrandColors.white,
                                fontWeight: FontWeight.w800,
                                height: 1.08,
                              ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          position,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: BrandColors.accentGold,
                                fontWeight: FontWeight.w600,
                                height: 1.2,
                              ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusPill(status: worker.status),
                  _IdentityFact(
                    icon: worker.availability
                        ? Icons.check_circle_outline
                        : Icons.schedule_outlined,
                    label: worker.availability ? 'Əlçatan' : 'Məşğul',
                  ),
                  _IdentityFact(
                    icon: Icons.workspace_premium_outlined,
                    label: _workerClassLabel(worker.workerClass),
                  ),
                  _IdentityFact(
                    icon: Icons.star_outline_rounded,
                    label:
                        '${worker.ratingAverage.toStringAsFixed(1)} (${worker.ratingCount})',
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  String _workerClassLabel(String? value) {
    if (value == null || value.isEmpty) return AppStrings.classNotSelected;
    return '$value sinif';
  }
}

class _IdentityFact extends StatelessWidget {
  const _IdentityFact({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 34),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: BrandColors.white.withValues(alpha: 0.11),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: BrandColors.accentGold.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: BrandColors.white, size: 15),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: BrandColors.white,
                fontWeight: FontWeight.w600,
                fontSize: 12,
                height: 1.15,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({required this.assignments});

  final List<Assignment> assignments;

  @override
  Widget build(BuildContext context) {
    final assigned = assignments
        .where((item) => item.status == 'assigned')
        .length;
    final accepted = assignments
        .where((item) => item.status == 'accepted')
        .length;
    final completed = assignments
        .where((item) => item.status == 'completed')
        .length;

    final newJobs = _CompactStatCard(
      label: 'Yeni işlər',
      value: '$assigned',
      icon: Icons.mark_email_unread_outlined,
    );
    final acceptedJobs = _CompactStatCard(
      label: 'Qəbul edilən',
      value: '$accepted',
      icon: Icons.task_alt_outlined,
    );
    final completedJobs = _CompactStatCard(
      label: 'Tamamlanmış işlər',
      value: '$completed',
      icon: Icons.verified_outlined,
      horizontal: true,
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 280) {
          return Column(
            children: [
              newJobs,
              const SizedBox(height: 10),
              acceptedJobs,
              const SizedBox(height: 10),
              completedJobs,
            ],
          );
        }
        return Column(
          children: [
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: newJobs),
                  const SizedBox(width: 10),
                  Expanded(child: acceptedJobs),
                ],
              ),
            ),
            const SizedBox(height: 10),
            completedJobs,
          ],
        );
      },
    );
  }
}

class _CompactStatCard extends StatelessWidget {
  const _CompactStatCard({
    required this.label,
    required this.value,
    required this.icon,
    this.horizontal = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: const EdgeInsets.all(15),
      child: horizontal
          ? Row(
              children: [
                _StatIcon(icon: icon),
                const SizedBox(width: 12),
                Expanded(child: _StatLabel(label: label)),
                const SizedBox(width: 10),
                _StatValue(value: value),
              ],
            )
          : Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _StatIcon(icon: icon),
                    const Spacer(),
                    _StatValue(value: value),
                  ],
                ),
                const SizedBox(height: 12),
                _StatLabel(label: label),
              ],
            ),
    );
  }
}

class _StatIcon extends StatelessWidget {
  const _StatIcon({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        color: BrandColors.primaryBurgundy.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: BrandColors.primaryBurgundy, size: 20),
    );
  }
}

class _StatLabel extends StatelessWidget {
  const _StatLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      maxLines: 3,
      overflow: TextOverflow.ellipsis,
      style: Theme.of(context).textTheme.titleSmall?.copyWith(
        color: BrandColors.darkText,
        fontWeight: FontWeight.w700,
        height: 1.2,
      ),
    );
  }
}

class _StatValue extends StatelessWidget {
  const _StatValue({required this.value});

  final String value;

  @override
  Widget build(BuildContext context) {
    return Text(
      value,
      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
        color: BrandColors.primaryBurgundy,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}

class _NextJobCard extends StatelessWidget {
  const _NextJobCard({required this.assignments});

  final List<Assignment> assignments;

  @override
  Widget build(BuildContext context) {
    final active =
        assignments
            .where(
              (item) => item.status == 'assigned' || item.status == 'accepted',
            )
            .toList()
          ..sort((a, b) {
            final left =
                a.order.startDatetime ?? DateTime.fromMillisecondsSinceEpoch(0);
            final right =
                b.order.startDatetime ?? DateTime.fromMillisecondsSinceEpoch(0);
            return left.compareTo(right);
          });

    if (active.isEmpty) {
      return const PremiumEmptyState(
        title: AppStrings.noAssignments,
        message: AppStrings.noAssignmentsPremium,
        icon: Icons.event_available_outlined,
      );
    }

    final next = active.first;
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final narrow = constraints.maxWidth < 300;
              final title = Text(
                'Gələcək iş',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.black,
                  fontWeight: FontWeight.w600,
                ),
              );
              if (narrow) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    title,
                    const SizedBox(height: 8),
                    StatusPill(status: next.status),
                  ],
                );
              }
              return Row(
                children: [
                  Expanded(child: title),
                  const SizedBox(width: 10),
                  Flexible(child: StatusPill(status: next.status)),
                ],
              );
            },
          ),
          const SizedBox(height: 12),
          Text(
            next.order.company.name,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(
                  Icons.room_service_outlined,
                  color: BrandColors.primaryBurgundy,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  next.category.isNotEmpty
                      ? next.category
                      : next.order.category,
                  softWrap: true,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: BrandColors.primaryBurgundy,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DashboardSkeleton extends StatelessWidget {
  const _DashboardSkeleton();

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmerGroup(
      child: ListView(
        children: const [
          PremiumCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBlock(height: 28, width: 220),
                SizedBox(height: 12),
                SkeletonBlock(height: 16, width: 160),
                SizedBox(height: 18),
                SkeletonBlock(height: 34),
              ],
            ),
          ),
          SizedBox(height: 14),
          SkeletonBlock(height: 78),
          SizedBox(height: 10),
          SkeletonBlock(height: 78),
          SizedBox(height: 10),
          SkeletonBlock(height: 140),
        ],
      ),
    );
  }
}

class _DashboardData {
  const _DashboardData({required this.worker, required this.assignments});

  final WorkerMe worker;
  final List<Assignment> assignments;
}
