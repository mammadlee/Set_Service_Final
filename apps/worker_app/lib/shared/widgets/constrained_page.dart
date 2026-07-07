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
      child: Stack(
        children: [
          if (showBackdrop)
            const Positioned.fill(
              child: IgnorePointer(child: LuxuryHotelBackdrop()),
            ),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Padding(padding: padding, child: child),
            ),
          ),
        ],
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
