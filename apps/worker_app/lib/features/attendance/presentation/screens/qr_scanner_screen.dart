import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/premium_components.dart';

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final MobileScannerController _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BrandColors.darkBurgundy,
      appBar: AppBar(
        title: const Text(AppStrings.scanQrTitle),
        backgroundColor: BrandColors.darkBurgundy,
        foregroundColor: BrandColors.white,
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              BrandColors.darkBurgundy,
              BrandColors.deepBurgundy,
              BrandColors.primaryBurgundy,
            ],
          ),
        ),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          children: [
            const PremiumHeroPanel(
              title: AppStrings.scanQrTitle,
              subtitle: AppStrings.luxuryQrGuidance,
              compact: true,
              children: [
                PremiumChip(
                  label: AppStrings.scanQr,
                  icon: Icons.qr_code_scanner_outlined,
                  dark: true,
                ),
              ],
            ),
            const SizedBox(height: 16),
            Premium3DCard(
              dark: true,
              padding: const EdgeInsets.all(10),
              child: AspectRatio(
                aspectRatio: 1,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: MobileScanner(
                    controller: _controller,
                    fit: BoxFit.cover,
                    onDetect: _handleCapture,
                    errorBuilder: _buildScannerError,
                    placeholderBuilder: (_) => const _ScannerPlaceholder(),
                    overlayBuilder: (context, constraints) {
                      return Stack(
                        children: [
                          Container(
                            color: BrandColors.darkBurgundy.withValues(
                              alpha: 0.18,
                            ),
                          ),
                          _ScanFrame(size: constraints.maxWidth * 0.72),
                          Align(
                            alignment: Alignment.bottomCenter,
                            child: Container(
                              margin: const EdgeInsets.all(14),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: BrandColors.darkBurgundy.withValues(
                                  alpha: 0.78,
                                ),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: const Text(
                                AppStrings.scanQr,
                                style: TextStyle(
                                  color: BrandColors.white,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            PremiumActionButton(
              secondary: true,
              onPressed: () => Navigator.of(context).pop<String?>(null),
              icon: Icons.keyboard_outlined,
              label: AppStrings.useManualQrToken,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildScannerError(
    BuildContext context,
    MobileScannerException error,
  ) {
    final message = switch (error.errorCode) {
      MobileScannerErrorCode.permissionDenied =>
        AppStrings.cameraPermissionDenied,
      MobileScannerErrorCode.unsupported => AppStrings.qrScannerUnavailable,
      _ => AppStrings.qrScannerError,
    };

    return Container(
      color: BrandColors.darkBurgundy,
      padding: const EdgeInsets.all(18),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          InlineMessage(message: message, kind: InlineMessageKind.error),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).pop<String?>(null),
            icon: const Icon(Icons.keyboard_outlined),
            label: const Text(AppStrings.useManualQrToken),
          ),
        ],
      ),
    );
  }

  void _handleCapture(BarcodeCapture capture) {
    if (_handled) return;

    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value == null || value.isEmpty) continue;

      _handled = true;
      unawaited(_controller.stop());
      if (mounted) Navigator.of(context).pop(value);
      return;
    }
  }
}

class _ScannerPlaceholder extends StatelessWidget {
  const _ScannerPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: BrandColors.darkBurgundy,
      padding: const EdgeInsets.all(24),
      child: const Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SkeletonShimmer(height: 180, radius: 24),
          SizedBox(height: 18),
          SkeletonShimmer(height: 14, width: 180),
        ],
      ),
    );
  }
}

class _ScanFrame extends StatefulWidget {
  const _ScanFrame({required this.size});

  final double size;

  @override
  State<_ScanFrame> createState() => _ScanFrameState();
}

class _ScanFrameState extends State<_ScanFrame>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SizedBox(
        width: widget.size,
        height: widget.size,
        child: Stack(
          children: [
            const _Corner(alignment: Alignment.topLeft),
            const _Corner(alignment: Alignment.topRight),
            const _Corner(alignment: Alignment.bottomLeft),
            const _Corner(alignment: Alignment.bottomRight),
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                return Positioned(
                  left: 18,
                  right: 18,
                  top: 22 + (widget.size - 44) * _controller.value,
                  child: Container(
                    height: 2,
                    decoration: BoxDecoration(
                      color: BrandColors.accentGold,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: BrandColors.accentGold.withValues(alpha: 0.55),
                          blurRadius: 16,
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Corner extends StatelessWidget {
  const _Corner({required this.alignment});

  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    const length = 48.0;
    const thickness = 4.0;
    final isRight = alignment.x > 0;
    final isBottom = alignment.y > 0;

    return Align(
      alignment: alignment,
      child: SizedBox(
        width: length,
        height: length,
        child: Stack(
          children: [
            Positioned(
              left: isRight ? null : 0,
              right: isRight ? 0 : null,
              top: isBottom ? null : 0,
              bottom: isBottom ? 0 : null,
              child: Container(
                width: length,
                height: thickness,
                decoration: BoxDecoration(
                  color: BrandColors.accentGold,
                  borderRadius: BorderRadius.circular(thickness),
                ),
              ),
            ),
            Positioned(
              left: isRight ? null : 0,
              right: isRight ? 0 : null,
              top: isBottom ? null : 0,
              bottom: isBottom ? 0 : null,
              child: Container(
                width: thickness,
                height: length,
                decoration: BoxDecoration(
                  color: BrandColors.accentGold,
                  borderRadius: BorderRadius.circular(thickness),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
