import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../../../shared/widgets/status_pill.dart';
import '../../../attendance/presentation/widgets/attendance_panel.dart';
import '../../data/assignment_repository.dart';
import '../../data/models/assignment.dart';

class AssignmentDetailScreen extends StatefulWidget {
  const AssignmentDetailScreen({required this.assignmentId, super.key});

  final String assignmentId;

  @override
  State<AssignmentDetailScreen> createState() => _AssignmentDetailScreenState();
}

class _AssignmentDetailScreenState extends State<AssignmentDetailScreen> {
  late Future<Assignment> _future;
  bool _isChangingStatus = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Assignment> _load() {
    return context.read<AssignmentRepository>().getAssignment(
      widget.assignmentId,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.assignmentDetail)),
      body: ConstrainedPage(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: FutureBuilder<Assignment>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const PremiumListSkeleton(itemCount: 2);
            }

            if (snapshot.hasError) {
              final error = snapshot.error;
              final message = error is ApiException
                  ? error.message
                  : AppStrings.assignmentLoadFailed;
              return ListView(
                children: [
                  const SizedBox(height: 80),
                  InlineMessage(
                    message: message,
                    kind: InlineMessageKind.error,
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _refresh,
                    icon: const Icon(Icons.refresh),
                    label: const Text(AppStrings.tryAgain),
                  ),
                ],
              );
            }

            final assignment = snapshot.data!;
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                children: [
                  _AssignmentHeader(assignment: assignment),
                  const SizedBox(height: 16),
                  if (_error != null) ...[
                    InlineMessage(
                      message: _error!,
                      kind: InlineMessageKind.error,
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (assignment.canAcceptOrReject)
                    _DecisionActions(
                      loading: _isChangingStatus,
                      onAccept: () => _changeStatus(accept: true),
                      onReject: () => _changeStatus(accept: false),
                    ),
                  if (!assignment.canAcceptOrReject)
                    InlineMessage(
                      message: _messageForStatus(assignment),
                      kind: assignment.canUseAttendance
                          ? InlineMessageKind.success
                          : InlineMessageKind.info,
                    ),
                  const SizedBox(height: 16),
                  if (assignment.canUseAttendance)
                    AttendancePanel(assignmentId: assignment.id)
                  else
                    const _AttendanceUnavailable(),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _changeStatus({required bool accept}) async {
    setState(() {
      _isChangingStatus = true;
      _error = null;
    });

    try {
      final repository = context.read<AssignmentRepository>();
      await (accept
          ? repository.acceptAssignment(widget.assignmentId)
          : repository.rejectAssignment(widget.assignmentId));
      if (!mounted) return;
      await _refresh();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = AppStrings.assignmentUpdateFailed);
    } finally {
      if (mounted) {
        setState(() => _isChangingStatus = false);
      }
    }
  }

  String _messageForStatus(Assignment assignment) {
    if (assignment.status == 'accepted') {
      return assignment.order.status == 'active'
          ? AppStrings.assignmentAcceptedActive
          : AppStrings.assignmentAcceptedInactive;
    }
    if (assignment.status == 'rejected') {
      return AppStrings.assignmentRejected;
    }
    if (assignment.status == 'cancelled') {
      return AppStrings.assignmentCancelled;
    }
    if (assignment.status == 'completed') {
      return AppStrings.assignmentCompleted;
    }
    return AppStrings.attendanceAfterAccept;
  }
}

class _AssignmentHeader extends StatelessWidget {
  const _AssignmentHeader({required this.assignment});

  final Assignment assignment;

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd.MM.yyyy, HH:mm');
    final statusHelp = AppStrings.assignmentStatusHelp(assignment.status);

    return PremiumCard(
      child: Padding(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    assignment.order.title,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                StatusPill(status: assignment.status),
              ],
            ),
            const SizedBox(height: 16),
            if (statusHelp != null) ...[
              InlineMessage(message: statusHelp),
              const SizedBox(height: 14),
            ],
            PremiumChip(
              label: assignment.category.isNotEmpty
                  ? assignment.category
                  : assignment.order.category,
              icon: Icons.room_service_outlined,
            ),
            const SizedBox(height: 14),
            _DetailRow(
              icon: Icons.business_outlined,
              label: AppStrings.company,
              value: assignment.order.company.name,
            ),
            _DetailRow(
              icon: Icons.place_outlined,
              label: AppStrings.location,
              value: assignment.order.location,
            ),
            if (assignment.order.startDatetime != null)
              _DetailRow(
                icon: Icons.login_outlined,
                label: AppStrings.starts,
                value: dateFormat.format(assignment.order.startDatetime!),
              ),
            if (assignment.order.endDatetime != null)
              _DetailRow(
                icon: Icons.logout_outlined,
                label: AppStrings.ends,
                value: dateFormat.format(assignment.order.endDatetime!),
              ),
            _DetailRow(
              icon: Icons.inventory_2_outlined,
              label: AppStrings.orderStatus,
              value: AppStrings.statusLabel(assignment.order.status),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: BrandColors.mutedBrown),
          const SizedBox(width: 10),
          SizedBox(
            width: 118,
            child: Text(
              label,
              style: const TextStyle(
                color: BrandColors.mutedBrown,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value.isEmpty ? '-' : value,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _DecisionActions extends StatelessWidget {
  const _DecisionActions({
    required this.loading,
    required this.onAccept,
    required this.onReject,
  });

  final bool loading;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        LoadingButton(
          label: AppStrings.acceptAssignment,
          icon: Icons.check_circle_outline,
          loading: loading,
          onPressed: onAccept,
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: loading ? null : onReject,
          icon: const Icon(Icons.cancel_outlined),
          label: const Text(AppStrings.rejectAssignment),
        ),
      ],
    );
  }
}

class _AttendanceUnavailable extends StatelessWidget {
  const _AttendanceUnavailable();

  @override
  Widget build(BuildContext context) {
    return const InlineMessage(message: AppStrings.attendanceOnlyAccepted);
  }
}
