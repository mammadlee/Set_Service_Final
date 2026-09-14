import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../core/session/app_role.dart';
import '../../../core/session/role_session_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/app_strings.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({super.key});

  static const _backgroundAsset = 'assets/brand/role_selection_background.png';
  static const _designSize = Size(1080, 2338);

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: BrandColors.transparent,
        statusBarIconBrightness: Brightness.dark,
        systemNavigationBarColor: BrandColors.creamBackground,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: BrandColors.creamBackground,
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final scale = math.min(
                constraints.maxWidth / _designSize.width,
                constraints.maxHeight / _designSize.height,
              );
              final artworkSize = _designSize * scale;

              return ClipRect(
                child: Stack(
                  key: const ValueKey('role-selection-viewport'),
                  fit: StackFit.expand,
                  children: [
                    const DecoratedBox(
                      key: ValueKey('role-selection-edge-fill'),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0xFFFDFBF9), Color(0xFFFDEFD4)],
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.center,
                      child: SizedBox(
                        key: const ValueKey('role-selection-artwork'),
                        width: artworkSize.width,
                        height: artworkSize.height,
                        child: FittedBox(
                          fit: BoxFit.fill,
                          child: SizedBox(
                            width: _designSize.width,
                            height: _designSize.height,
                            child: Stack(
                              children: [
                                Positioned.fill(
                                  child: Image.asset(
                                    _backgroundAsset,
                                    fit: BoxFit.fill,
                                    filterQuality: FilterQuality.high,
                                  ),
                                ),
                                _RoleHitTarget(
                                  rect: const Rect.fromLTWH(260, 135, 560, 385),
                                  label: AppStrings.adminLogin,
                                  onLongPress: () => context
                                      .read<RoleSessionController>()
                                      .selectRole(AppRole.admin),
                                ),
                                _RoleHitTarget(
                                  rect: const Rect.fromLTWH(
                                    124,
                                    1055,
                                    890,
                                    220,
                                  ),
                                  label: AppStrings.continueAsWorker,
                                  onTap: () => context
                                      .read<RoleSessionController>()
                                      .selectRole(AppRole.worker),
                                ),
                                _RoleHitTarget(
                                  rect: const Rect.fromLTWH(
                                    124,
                                    1337,
                                    890,
                                    220,
                                  ),
                                  label: AppStrings.continueAsCompany,
                                  onTap: () => context
                                      .read<RoleSessionController>()
                                      .selectRole(AppRole.company),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _RoleHitTarget extends StatelessWidget {
  const _RoleHitTarget({
    required this.rect,
    required this.label,
    this.onTap,
    this.onLongPress,
  });

  final Rect rect;
  final String label;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    return Positioned.fromRect(
      rect: rect,
      child: Semantics(
        button: true,
        label: label,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          onLongPress: onLongPress,
        ),
      ),
    );
  }
}
