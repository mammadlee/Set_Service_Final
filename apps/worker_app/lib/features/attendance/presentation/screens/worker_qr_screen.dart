import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../data/attendance_repository.dart';
import 'qr_scanner_screen.dart';

class WorkerQrScreen extends StatefulWidget {
  const WorkerQrScreen({super.key});

  @override
  State<WorkerQrScreen> createState() => _WorkerQrScreenState();
}

class _WorkerQrScreenState extends State<WorkerQrScreen> {
  final _qrController = TextEditingController();
  final _notesController = TextEditingController();
  bool _loading = false;
  String? _error;
  String? _success;

  @override
  void dispose() {
    _qrController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ConstrainedPage(
      showBackdrop: true,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _QrScanFrame(onTap: _loading ? null : _scanQr),
          const SizedBox(height: 14),
          const _QrWarning(),
          const SizedBox(height: 12),
          if (_error != null) ...[
            InlineMessage(message: _error!, kind: InlineMessageKind.error),
            const SizedBox(height: 12),
          ],
          if (_success != null) ...[
            InlineMessage(message: _success!, kind: InlineMessageKind.success),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _qrController,
            minLines: 1,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: AppStrings.qrToken,
              hintText: AppStrings.qrTokenHint,
              prefixIcon: Icon(Icons.qr_code_2_outlined),
            ),
          ),
          const SizedBox(height: 14),
          LoadingButton(
            label: 'Giriş et',
            icon: Icons.login_outlined,
            loading: _loading,
            onPressed: () {
              if (_qrController.text.trim().isEmpty) {
                _scanQr();
              } else {
                _submitScannedQr();
              }
            },
          ),
        ],
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
      final page = await context.read<AttendanceRepository>().listOpen();
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
          qrToken: qrToken,
          notes: _notesController.text,
        );
        if (!mounted) return;
        _success =
            '${AppStrings.checkInRecorded} ${AppStrings.scanQrForCheckout}';
      } else {
        await repository.checkOut(
          qrToken: qrToken,
          notes: _notesController.text,
        );
        if (!mounted) return;
        _success = AppStrings.checkOutRecorded;
      }
      _qrController.clear();
      _notesController.clear();
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

  String _friendlyAttendanceError(ApiException error) {
    return switch (error.code) {
      'KIOSK_ASSIGNMENT_NOT_FOUND' =>
        'Bu sifariş üçün sizə təsdiqlənmiş təyinat tapılmadı.',
      'ASSIGNMENT_NOT_ACCEPTED' => AppStrings.assignmentMustBeAccepted,
      'ATTENDANCE_ALREADY_CHECKED_IN' => AppStrings.alreadyCheckedIn,
      'ATTENDANCE_ALREADY_COMPLETED' => AppStrings.attendanceCompleted,
      'ATTENDANCE_SESSION_ALREADY_EXISTS' => AppStrings.attendanceCompleted,
      'ATTENDANCE_NOT_CHECKED_IN' => AppStrings.attendanceNotCheckedIn,
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

class _QrScanFrame extends StatelessWidget {
  const _QrScanFrame({required this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final height = (constraints.maxWidth * 1.02)
            .clamp(300.0, 390.0)
            .toDouble();
        return SizedBox(
          height: height,
          child: Material(
            color: BrandColors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(26),
              onTap: onTap,
              child: Ink(
                decoration: BoxDecoration(
                  color: BrandColors.cardCream.withValues(alpha: 0.82),
                  borderRadius: BorderRadius.circular(26),
                  border: Border.all(color: Colors.black, width: 1.5),
                ),
                child: const Center(
                  child: Icon(
                    Icons.photo_camera_outlined,
                    size: 58,
                    color: Colors.black,
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _QrWarning extends StatelessWidget {
  const _QrWarning();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.error_outline_rounded,
          color: BrandColors.primaryBurgundy,
          size: 18,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            'QR kod hər 30 saniyədən bir yenilənir, vaxtı bitmiş kod oxunarsa yeni QR kod skan edin.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: BrandColors.primaryBurgundy,
              fontWeight: FontWeight.w600,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}
