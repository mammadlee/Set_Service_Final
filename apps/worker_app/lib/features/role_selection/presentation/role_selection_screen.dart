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

  static const _backgroundAsset = 'assets/brand/role_selection_background.png';

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
        body: Stack(
          fit: StackFit.expand,
          children: [
            Image.asset(
              _backgroundAsset,
              fit: BoxFit.cover,
              alignment: Alignment.center,
              filterQuality: FilterQuality.high,
            ),
            ColoredBox(color: BrandColors.creamBackground.withValues(alpha: 0.30)),
            SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final compactHeight = constraints.maxHeight < 700;
                  final horizontal = constraints.maxWidth < 380 ? 18.0 : 24.0;

                  return SingleChildScrollView(
                    padding: EdgeInsets.fromLTRB(horizontal, 12, horizontal, 18),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: constraints.maxHeight - 30,
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          GestureDetector(
                            onLongPress: () => context
                                .read<RoleSessionController>()
                                .selectRole(AppRole.admin),
                            child: AppLogo(size: compactHeight ? 60 : 72),
                          ),
                          Padding(
                            padding: EdgeInsets.symmetric(
                              vertical: compactHeight ? 14 : 26,
                            ),
                            child: Column(
                              children: [
                                Text(
                                  'Davam etmək üçün rolunuzu seçin',
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium
                                      ?.copyWith(
                                        color: BrandColors.darkText,
                                        fontWeight: FontWeight.w800,
                                        height: 1.12,
                                      ),
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  'İşçi və ya müəssisə hesabı ilə davam edə bilərsiniz.',
                                  textAlign: TextAlign.center,
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                        color: BrandColors.mutedBrown,
                                        height: 1.35,
                                      ),
                                ),
                              ],
                            ),
                          ),
                          Column(
                            children: [
                              _RoleCard(
                                icon: Icons.badge_outlined,
                                title: AppStrings.continueAsWorker,
                                subtitle: 'İşçi hesabınıza daxil olun və işlərinizi idarə edin.',
                                onTap: () => context
                                    .read<RoleSessionController>()
                                    .selectRole(AppRole.worker),
                              ),
                              const SizedBox(height: 14),
                              _RoleCard(
                                icon: Icons.business_outlined,
                                title: AppStrings.continueAsCompany,
                                subtitle: 'Müəssisə hesabınıza daxil olun və sifarişləri idarə edin.',
                                onTap: () => context
                                    .read<RoleSessionController>()
                                    .selectRole(AppRole.company),
                              ),
                            ],
                          ),
                          SizedBox(height: compactHeight ? 8 : 20),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
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
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BrandColors.white.withValues(alpha: 0.96),
      borderRadius: BorderRadius.circular(26),
      child: InkWell(
        borderRadius: BorderRadius.circular(26),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            border: Border.all(
              color: BrandColors.accentGold.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: BrandColors.primaryBurgundy.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(icon, color: BrandColors.primaryBurgundy, size: 27),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            color: BrandColors.darkText,
                            fontWeight: FontWeight.w800,
                            height: 1.15,
                          ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      subtitle,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: BrandColors.mutedBrown,
                            height: 1.30,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.arrow_forward_ios_rounded,
                size: 18,
                color: BrandColors.primaryBurgundy,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
