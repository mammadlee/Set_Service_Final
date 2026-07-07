import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../data/attendance_repository.dart';
import '../../data/models/attendance.dart';
import '../screens/qr_scanner_screen.dart';

class AttendancePanel extends StatefulWidget {
  const AttendancePanel({required this.assignmentId, super.key});

  final String assignmentId;

  @override
  State<AttendancePanel> createState() => _AttendancePanelState();
}

class _AttendancePanelState extends State<AttendancePanel> {
  final _qrController = TextEditingController();
  final _notesController = TextEditingController();
  late Future<AttendancePage> _future;
  bool _loading = false;
  String? _error;
  String? _success;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void dispose() {
    _qrController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<AttendancePage> _load() {
    return context.read<AttendanceRepository>().listForAssignment(
      widget.assignmentId,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Padding(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: BrandColors.primaryBurgundy.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.qr_code_2_outlined,
                    color: BrandColors.primaryBurgundy,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    AppStrings.attendance,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: AppStrings.refreshAttendance,
                  onPressed: _loading ? null : _refresh,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            const SizedBox(height: 12),
            FutureBuilder<AttendancePage>(
              future: _future,
              builder: (context, snapshot) {
                final logs = snapshot.data?.data ?? const <AttendanceLog>[];
                final openLog = logs.where((log) => log.isOpen).firstOrNull;
                final completedLog = logs
                    .where((log) => log.checkoutTime != null)
                    .firstOrNull;

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (snapshot.connectionState == ConnectionState.waiting)
                      const SkeletonBlock(height: 10)
                    else if (snapshot.hasError)
                      InlineMessage(
                        message: _message(snapshot.error),
                        kind: InlineMessageKind.error,
                      )
                    else if (logs.isEmpty)
                      const InlineMessage(
                        message: AppStrings.noAttendanceSession,
                      )
                    else
                      _AttendanceSummary(
                        openLog: openLog,
                        completedLog: completedLog,
                      ),
                    const SizedBox(height: 16),
                    if (_error != null) ...[
                      InlineMessage(
                        message: _error!,
                        kind: InlineMessageKind.error,
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (_success != null) ...[
                      InlineMessage(
                        message: _success!,
                        kind: InlineMessageKind.success,
                      ),
                      const SizedBox(height: 12),
                    ],
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: BrandColors.creamBackground,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: BrandColors.softBeige.withValues(alpha: 0.8),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const PremiumChip(
                            label: AppStrings.scanQr,
                            icon: Icons.qr_code_scanner_outlined,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            AppStrings.qrHelp,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: BrandColors.mutedBrown,
                                  height: 1.35,
                                ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: _loading ? null : _scanQr,
                      icon: const Icon(Icons.qr_code_scanner_outlined),
                      label: const Text(AppStrings.scanQr),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _qrController,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: AppStrings.qrToken,
                        hintText: AppStrings.qrTokenHint,
                        prefixIcon: Icon(Icons.qr_code_scanner_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _notesController,
                      minLines: 1,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: AppStrings.notes,
                        hintText: AppStrings.optional,
                        prefixIcon: Icon(Icons.notes_outlined),
                      ),
                    ),
                    const SizedBox(height: 16),
                    LoadingButton(
                      label: AppStrings.checkIn,
                      icon: Icons.login_outlined,
                      loading: _loading,
                      onPressed: completedLog != null
                          ? null
                          : () => _submit(checkIn: true),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: _loading || openLog == null
                          ? null
                          : () => _submit(checkIn: false),
                      icon: const Icon(Icons.logout_outlined),
                      label: const Text(AppStrings.checkOut),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _scanQr() async {
    final token = await Navigator.of(
      context,
    ).push<String?>(MaterialPageRoute(builder: (_) => const QrScannerScreen()));
    if (!mounted || token == null || token.trim().isEmpty) return;
    setState(() {
      _qrController.text = token.trim();
      _success = null;
      _error = null;
    });
    await _submitScannedQr();
  }

  Future<void> _submitScannedQr() async {
    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });

    bool hasOpenAttendance;
    try {
      final page = await context.read<AttendanceRepository>().listOpen(
        assignmentId: widget.assignmentId,
      );
      hasOpenAttendance = page.data.any((log) => log.isOpen);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _friendlyAttendanceError(error);
      });
      return;
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = AppStrings.attendanceLoadFailed;
      });
      return;
    }

    if (!mounted) return;
    setState(() => _loading = false);
    await _submit(checkIn: !hasOpenAttendance);
  }

  Future<void> _submit({required bool checkIn}) async {
    final qrToken = _qrController.text.trim();
    if (qrToken.isEmpty) {
      setState(() {
        _error = AppStrings.qrTokenRequired;
        _success = null;
      });
      return;
    }

    final repository = context.read<AttendanceRepository>();
    if (!checkIn && !await _confirmCheckout()) return;
    if (!mounted) return;

    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });

    try {
      if (checkIn) {
        await repository.checkIn(
          assignmentId: widget.assignmentId,
          qrToken: qrToken,
          notes: _notesController.text,
        );
        if (!mounted) return;
        _success =
            '${AppStrings.checkInRecorded} ${AppStrings.scanQrForCheckout}';
        _qrController.clear();
      } else {
        await repository.checkOut(
          assignmentId: widget.assignmentId,
          qrToken: qrToken,
          notes: _notesController.text,
        );
        if (!mounted) return;
        _success = AppStrings.checkOutRecorded;
        _qrController.clear();
      }
      _notesController.clear();
      await _refresh();
    } on ApiException catch (error) {
      if (!mounted) return;
      _error = _friendlyAttendanceError(error);
    } catch (_) {
      if (!mounted) return;
      _error = AppStrings.attendanceRequestFailed;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _message(Object? error) {
    return error is ApiException
        ? error.message
        : AppStrings.attendanceLoadFailed;
  }

  String _friendlyAttendanceError(ApiException error) {
    return switch (error.code) {
      'ASSIGNMENT_NOT_ACCEPTED' => AppStrings.assignmentMustBeAccepted,
      'ATTENDANCE_ALREADY_CHECKED_IN' => AppStrings.alreadyCheckedIn,
      'ATTENDANCE_ALREADY_COMPLETED' => AppStrings.attendanceCompleted,
      'ATTENDANCE_SESSION_ALREADY_EXISTS' => AppStrings.attendanceCompleted,
      'QR_TOKEN_INVALID' => AppStrings.qrInvalid,
      'QR_TOKEN_EXPIRED' => AppStrings.qrExpired,
      _ => error.message,
    };
  }

  Future<bool> _confirmCheckout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) {
        return Dialog(
          backgroundColor: BrandColors.transparent,
          insetPadding: const EdgeInsets.symmetric(horizontal: 22),
          child: PremiumCard(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: BrandColors.accentGold.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Icon(
                        Icons.logout_outlined,
                        color: BrandColors.primaryBurgundy,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        AppStrings.checkoutConfirmTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  AppStrings.checkoutConfirmMessage,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: BrandColors.urbanGraphite,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: PremiumActionButton(
                    label: AppStrings.checkoutConfirmAction,
                    icon: Icons.logout_outlined,
                    onPressed: () => Navigator.of(dialogContext).pop(true),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(dialogContext).pop(false),
                    child: const Text(AppStrings.cancel),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    return confirmed == true;
  }
}

class _AttendanceSummary extends StatelessWidget {
  const _AttendanceSummary({required this.openLog, required this.completedLog});

  final AttendanceLog? openLog;
  final AttendanceLog? completedLog;

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd.MM.yyyy, HH:mm');

    if (completedLog != null) {
      return InlineMessage(
        message: AppStrings.attendanceCompletedSummary(
          dateFormat.format(completedLog!.checkinTime!),
          dateFormat.format(completedLog!.checkoutTime!),
          completedLog!.durationMinutes,
        ),
        kind: InlineMessageKind.success,
      );
    }

    if (openLog != null) {
      return InlineMessage(
        message: AppStrings.checkedInAt(
          dateFormat.format(openLog!.checkinTime!),
        ),
        kind: InlineMessageKind.info,
      );
    }

    return const InlineMessage(message: AppStrings.noOpenAttendanceSession);
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}
