import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/checkout_confirmation_dialog.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
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
    // Let the API identify the order encoded in the signed token. Looking at
    // any open attendance first is ambiguous when a worker has more than one
    // active assignment: a QR for a new order could be sent as checkout for a
    // different order. Checkout is attempted only after this exact assignment
    // reports that it was already checked in.
    await _submit(checkIn: true, fallbackToCheckout: true);
  }

  Future<void> _submit({
    required bool checkIn,
    bool fallbackToCheckout = false,
    bool confirmCheckout = true,
  }) async {
    final qrToken = _qrController.text.trim();
    if (qrToken.isEmpty) {
      setState(() {
        _error = AppStrings.qrTokenRequired;
        _success = null;
      });
      return;
    }

    final repository = context.read<AttendanceRepository>();
    if (!checkIn && confirmCheckout && !await _confirmCheckout()) return;
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
      if (checkIn &&
          fallbackToCheckout &&
          error.code == 'ATTENDANCE_ALREADY_CHECKED_IN') {
        if (!mounted) return;
        setState(() => _loading = false);
        if (!await _confirmCheckout() || !mounted) return;
        await _submit(checkIn: false, confirmCheckout: false);
        return;
      }
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

  Future<bool> _confirmCheckout() => showCheckoutConfirmationDialog(context);
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
