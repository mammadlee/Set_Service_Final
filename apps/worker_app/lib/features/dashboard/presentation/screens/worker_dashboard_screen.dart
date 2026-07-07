import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../../../shared/widgets/status_pill.dart';
import '../../../assignments/data/assignment_repository.dart';
import '../../../assignments/data/models/assignment.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../worker/data/worker_repository.dart';

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
    final workerRepository = context.read<WorkerRepository>();
    final assignmentRepository = context.read<AssignmentRepository>();
    final workerFuture = workerRepository.getMe();
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
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              children: [
                PremiumEntrance(child: _GreetingCard(worker: data.worker)),
                const SizedBox(height: 16),
                PremiumEntrance(
                  delay: const Duration(milliseconds: 90),
                  child: _SummaryGrid(assignments: data.assignments),
                ),
                const SizedBox(height: 18),
                PremiumEntrance(
                  delay: const Duration(milliseconds: 190),
                  child: _NextJobCard(assignments: data.assignments),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _GreetingCard extends StatelessWidget {
  const _GreetingCard({required this.worker});

  final WorkerMe worker;

  @override
  Widget build(BuildContext context) {
    final cleanName = worker.name.trim();
    final firstName = cleanName.isEmpty
        ? AppStrings.worker
        : cleanName.split(RegExp(r'\s+')).first;
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: BrandColors.primaryBurgundy,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: Center(
              child: Text(
                'SET',
                style: TextStyle(
                  color: BrandColors.accentGold.withValues(alpha: 0.18),
                  fontFamily: 'serif',
                  fontSize: 112,
                  height: 0.8,
                ),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 42,
                    backgroundColor: BrandColors.white.withValues(alpha: 0.2),
                    backgroundImage: worker.profilePhotoUrl == null
                        ? null
                        : NetworkImage(worker.profilePhotoUrl!),
                    child: worker.profilePhotoUrl == null
                        ? const Icon(
                            Icons.person_outline,
                            color: BrandColors.white,
                            size: 42,
                          )
                        : null,
                  ),
                  const Spacer(),
                  StatusPill(status: worker.status),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                'Salam, $firstName 👋',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: BrandColors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                worker.position?.isNotEmpty == true
                    ? worker.position!
                    : AppStrings.worker,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: BrandColors.accentGold,
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: _WorkerHeroStat(
                      icon: Icons.verified_outlined,
                      value: worker.availability ? 'Əlçatan' : 'Məşğul',
                    ),
                  ),
                  Expanded(
                    child: _WorkerHeroStat(
                      icon: Icons.book_outlined,
                      value: _workerClassLabel(worker.workerClass),
                    ),
                  ),
                  Expanded(
                    child: _WorkerHeroStat(
                      icon: Icons.star_outline_rounded,
                      value: worker.ratingAverage.toStringAsFixed(1),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _workerClassLabel(String? value) {
    if (value == null || value.isEmpty) return AppStrings.classNotSelected;
    return '$value sinif işçi';
  }
}

class _WorkerHeroStat extends StatelessWidget {
  const _WorkerHeroStat({required this.icon, required this.value});

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: BrandColors.white, size: 24),
        const SizedBox(height: 6),
        Text(
          value,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: BrandColors.white,
            fontWeight: FontWeight.w600,
            fontSize: 12,
          ),
        ),
      ],
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

    return Column(
      children: [
        _CompactStatCard(label: 'Yeni işlər', value: '$assigned'),
        const SizedBox(height: 12),
        _CompactStatCard(label: 'Qəbul edilən işlər', value: '$accepted'),
        const SizedBox(height: 12),
        _CompactStatCard(label: 'Tamamlanmış işlər', value: '$completed'),
      ],
    );
  }
}

class _CompactStatCard extends StatelessWidget {
  const _CompactStatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 22),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: Colors.black,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: Colors.black,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
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
          Row(
            children: [
              Expanded(
                child: Text(
                  'Gələcək iş',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Colors.black,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              StatusPill(status: next.status),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            next.order.company.name,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              const Icon(
                Icons.room_service_outlined,
                color: BrandColors.primaryBurgundy,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  next.category.isNotEmpty
                      ? next.category
                      : next.order.category,
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
