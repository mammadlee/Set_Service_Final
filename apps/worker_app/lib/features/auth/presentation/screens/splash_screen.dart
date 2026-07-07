import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../shared/widgets/app_logo.dart';
import '../../../../shared/widgets/premium_components.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BrandColors.creamBackground,
      body: SafeArea(
        child: Center(
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: const Duration(milliseconds: 700),
            curve: Curves.easeOutCubic,
            builder: (context, value, child) {
              return Opacity(
                opacity: value,
                child: Transform.translate(
                  offset: Offset(0, 18 * (1 - value)),
                  child: Transform.scale(
                    scale: 0.96 + value * 0.04,
                    child: child,
                  ),
                ),
              );
            },
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedBuilder(
                  animation: _controller,
                  builder: (context, child) {
                    return Transform.rotate(
                      angle: _controller.value * math.pi * 2,
                      child: child,
                    );
                  },
                  child: Container(
                    width: 132,
                    height: 132,
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: SweepGradient(
                        colors: [
                          BrandColors.accentGold.withValues(alpha: 0.1),
                          BrandColors.accentGold,
                          BrandColors.accentGold.withValues(alpha: 0.1),
                        ],
                      ),
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: BrandColors.white.withValues(alpha: 0.88),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: BrandColors.darkBurgundy.withValues(
                              alpha: 0.12,
                            ),
                            blurRadius: 40,
                            offset: const Offset(0, 22),
                          ),
                        ],
                      ),
                      child: const AppLogo(size: 78, showText: false),
                    ),
                  ),
                ),
                const SizedBox(height: 26),
                Text(
                  AppStrings.brandName,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: BrandColors.primaryBurgundy,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  AppStrings.splashSubtitle,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: BrandColors.mutedBrown,
                    fontWeight: FontWeight.w700,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 28),
                const SkeletonShimmer(height: 5, width: 88, radius: 999),
                const SizedBox(height: 14),
                Text(
                  AppStrings.loading,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: BrandColors.mutedBrown,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
