import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/router/app_routes.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../../auth/presentation/controllers/auth_controller.dart';
import '../../data/assignment_repository.dart';
import '../../data/models/assignment.dart';
import '../widgets/assignment_card.dart';

class AssignmentListScreen extends StatefulWidget {
  const AssignmentListScreen({this.embedded = false, super.key});

  final bool embedded;

  @override
  State<AssignmentListScreen> createState() => _AssignmentListScreenState();
}

class _AssignmentListScreenState extends State<AssignmentListScreen> {
  late Future<AssignmentPage> _future;
  _AssignmentFilter _filter = _AssignmentFilter.upcoming;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<AssignmentPage> _load() {
    return context.read<AssignmentRepository>().listAssignments();
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();

    final content = ConstrainedPage(
      showBackdrop: true,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: FutureBuilder<AssignmentPage>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const PremiumListSkeleton();
          }

          if (snapshot.hasError) {
            return _LoadError(error: snapshot.error, onRetry: _refresh);
          }

          final assignments = snapshot.data?.data ?? const <Assignment>[];
          final visibleAssignments = _filterAssignments(assignments);
          if (assignments.isEmpty) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                children: [
                  const SizedBox(height: 80),
                  PremiumEmptyState(
                    title: AppStrings.noAssignments,
                    message: AppStrings.noAssignmentsPremium,
                    icon: Icons.assignment_outlined,
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
            child: ListView.builder(
              itemCount: visibleAssignments.length + 1,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(
                        width: double.infinity,
                        child: SegmentedButton<_AssignmentFilter>(
                          expandedInsets: EdgeInsets.zero,
                          segments: const [
                            ButtonSegment(
                              value: _AssignmentFilter.upcoming,
                              label: Text(AppStrings.upcomingJobs),
                            ),
                            ButtonSegment(
                              value: _AssignmentFilter.past,
                              label: Text(AppStrings.pastJobs),
                            ),
                            ButtonSegment(
                              value: _AssignmentFilter.all,
                              label: Text(AppStrings.allJobs),
                            ),
                          ],
                          selected: {_filter},
                          onSelectionChanged: (value) =>
                              setState(() => _filter = value.first),
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (visibleAssignments.isEmpty)
                        InlineMessage(
                          message: _filter == _AssignmentFilter.past
                              ? AppStrings.noPastJobs
                              : AppStrings.noUpcomingJobs,
                        ),
                    ],
                  );
                }

                final itemIndex = index - 1;
                final assignment = visibleAssignments[itemIndex];
                final delayIndex = itemIndex < 6 ? itemIndex : 6;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: PremiumEntrance(
                    delay: Duration(milliseconds: delayIndex * 45),
                    child: AssignmentCard(
                      assignment: assignment,
                      onTap: () async {
                        await Navigator.of(context).pushNamed(
                          AppRoutes.assignmentDetail,
                          arguments: assignment.id,
                        );
                        if (mounted) _refresh();
                      },
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );

    if (widget.embedded) return content;

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppStrings.assignments),
        actions: [
          IconButton(
            tooltip: AppStrings.refresh,
            onPressed: _refresh,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: AppStrings.logout,
            onPressed: auth.isSubmitting
                ? null
                : () => context.read<AuthController>().logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: content,
    );
  }

  List<Assignment> _filterAssignments(List<Assignment> assignments) {
    final now = DateTime.now();
    final sorted = [...assignments]
      ..sort((a, b) {
        final left =
            a.order.startDatetime ?? DateTime.fromMillisecondsSinceEpoch(0);
        final right =
            b.order.startDatetime ?? DateTime.fromMillisecondsSinceEpoch(0);
        return left.compareTo(right);
      });
    return switch (_filter) {
      _AssignmentFilter.all => sorted,
      _AssignmentFilter.upcoming =>
        sorted.where((item) => !_isPast(item, now)).toList(),
      _AssignmentFilter.past =>
        sorted.where((item) => _isPast(item, now)).toList(),
    };
  }

  bool _isPast(Assignment assignment, DateTime now) {
    if (assignment.status == 'rejected' ||
        assignment.status == 'cancelled' ||
        assignment.status == 'completed') {
      return true;
    }
    final end = assignment.order.endDatetime;
    return end != null && end.isBefore(now);
  }
}

enum _AssignmentFilter { upcoming, past, all }

class _LoadError extends StatelessWidget {
  const _LoadError({required this.error, required this.onRetry});

  final Object? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final message = error is ApiException
        ? (error! as ApiException).message
        : AppStrings.assignmentsLoadFailed;

    return ListView(
      children: [
        const SizedBox(height: 80),
        InlineMessage(message: message, kind: InlineMessageKind.error),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh),
          label: const Text(AppStrings.tryAgain),
        ),
      ],
    );
  }
}
