import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../core/session/app_role.dart';
import '../../../core/session/role_session_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/app_strings.dart';
import '../../../shared/widgets/app_logo.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({super.key});

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
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  BrandColors.creamBackground,
                  BrandColors.cardCream,
                  BrandColors.accentGold.withValues(alpha: 0.08),
                ],
              ),
            ),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxHeight < 700;
                return SingleChildScrollView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: EdgeInsets.fromLTRB(
                    20,
                    compact ? 14 : 28,
                    20,
                    compact ? 18 : 28,
                  ),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: (constraints.maxHeight - (compact ? 32 : 56))
                          .clamp(0.0, double.infinity),
                    ),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 520),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Center(
                              child: AppLogo(size: compact ? 34 : 40),
                            ),
                            SizedBox(height: compact ? 12 : 18),
                            Text(
                              'SET Service-ə xoş gəlmisiniz',
                              textAlign: TextAlign.center,
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineMedium
                                  ?.copyWith(
                                    color: BrandColors.darkText,
                                    fontWeight: FontWeight.w800,
                                    height: 1.12,
                                  ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Davam etmək üçün hesab növünüzü seçin.',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodyLarge
                                  ?.copyWith(
                                    color: BrandColors.mutedBrown,
                                    height: 1.4,
                                  ),
                            ),
                            SizedBox(height: compact ? 20 : 28),
                            _RoleCard(
                              icon: Icons.badge_outlined,
                              title: AppStrings.continueAsWorker,
                              subtitle:
                                  'Tapşırıqlarınızı, QR giriş-çıxışı və profilinizi idarə edin.',
                              onTap: () => context
                                  .read<RoleSessionController>()
                                  .selectRole(AppRole.worker),
                            ),
                            const SizedBox(height: 12),
                            _RoleCard(
                              icon: Icons.apartment_rounded,
                              title: AppStrings.continueAsCompany,
                              subtitle:
                                  'Sifarişləri, işçiləri və əməliyyatları idarə edin.',
                              onTap: () => context
                                  .read<RoleSessionController>()
                                  .selectRole(AppRole.company),
                            ),
                            const SizedBox(height: 12),
                            _RoleCard(
                              icon: Icons.admin_panel_settings_outlined,
                              title: AppStrings.adminLogin,
                              subtitle:
                                  'İdarəetmə səlahiyyəti olan hesabla davam edin.',
                              emphasized: false,
                              onTap: () => context
                                  .read<RoleSessionController>()
                                  .selectRole(AppRole.admin),
                            ),
                            SizedBox(height: compact ? 18 : 26),
                            Text(
                              'www.setservice.az',
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: BrandColors.mutedBrown,
                                    fontWeight: FontWeight.w600,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.emphasized = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final background = emphasized
        ? BrandColors.primaryBurgundy
        : BrandColors.cardCream;
    final foreground = emphasized ? BrandColors.white : BrandColors.darkText;
    final secondary = emphasized
        ? BrandColors.softBeige
        : BrandColors.mutedBrown;
    final iconBackground = emphasized
        ? BrandColors.white.withValues(alpha: 0.12)
        : BrandColors.primaryBurgundy.withValues(alpha: 0.08);

    return Semantics(
      button: true,
      label: title,
      child: Material(
        color: BrandColors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: onTap,
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: emphasized
                    ? BrandColors.accentGold.withValues(alpha: 0.4)
                    : BrandColors.accentGold.withValues(alpha: 0.55),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: iconBackground,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    icon,
                    color: emphasized
                        ? BrandColors.accentGold
                        : BrandColors.primaryBurgundy,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: foreground,
                          fontWeight: FontWeight.w800,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: secondary,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Icon(
                  Icons.arrow_forward_rounded,
                  color: emphasized
                      ? BrandColors.accentGold
                      : BrandColors.primaryBurgundy,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
