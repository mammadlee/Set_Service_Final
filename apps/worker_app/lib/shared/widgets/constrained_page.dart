import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

class ConstrainedPage extends StatelessWidget {
  const ConstrainedPage({
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.showBackdrop = false,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final bool showBackdrop;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final compact = width < 380;
          final resolvedPadding = padding.resolve(Directionality.of(context));
          final adaptivePadding = EdgeInsets.fromLTRB(
            compact ? resolvedPadding.left.clamp(12.0, 16.0) : resolvedPadding.left,
            resolvedPadding.top,
            compact ? resolvedPadding.right.clamp(12.0, 16.0) : resolvedPadding.right,
            resolvedPadding.bottom,
          );

          return Stack(
            children: [
              if (showBackdrop)
                const Positioned.fill(
                  child: IgnorePointer(child: LuxuryHotelBackdrop()),
                ),
              Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: Padding(
                    padding: adaptivePadding,
                    child: SizedBox(width: double.infinity, child: child),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class LuxuryHotelBackdrop extends StatelessWidget {
  const LuxuryHotelBackdrop({super.key});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: BrandColors.creamBackground,
      child: Align(
        alignment: Alignment.bottomCenter,
        child: Image.asset(
          'assets/brand/admin_hotel_backdrop.png',
          width: double.infinity,
          fit: BoxFit.fitWidth,
          filterQuality: FilterQuality.high,
        ),
      ),
    );
  }
}
