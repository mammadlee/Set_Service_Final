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
        body: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xFFFFFCF6),
                BrandColors.creamBackground,
              ],
            ),
          ),
          child: SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final compactHeight = constraints.maxHeight < 700;
                final narrow = constraints.maxWidth < 380;
                final horizontal = narrow ? 18.0 : 24.0;

                return SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(
                    horizontal,
                    compactHeight ? 8 : 14,
                    horizontal,
                    20,
                  ),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GestureDetector(
                            onLongPress: () => context
                                .read<RoleSessionController>()
                                .selectRole(AppRole.admin),
                            child: AppLogo(size: compactHeight ? 42 : 48),
                          ),
                          SizedBox(height: compactHeight ? 8 : 14),
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
                          const SizedBox(height: 8),
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
                          SizedBox(height: compactHeight ? 18 : 26),
                          _RoleCard(
                            icon: Icons.badge_outlined,
                            title: AppStrings.continueAsWorker,
                            subtitle:
                                'İşçi hesabınıza daxil olun və işlərinizi idarə edin.',
                            onTap: () => context
                                .read<RoleSessionController>()
                                .selectRole(AppRole.worker),
                          ),
                          const SizedBox(height: 14),
                          _RoleCard(
                            icon: Icons.business_outlined,
                            title: AppStrings.continueAsCompany,
                            subtitle:
                                'Müəssisə hesabınıza daxil olun və sifarişləri idarə edin.',
                            onTap: () => context
                                .read<RoleSessionController>()
                                .selectRole(AppRole.company),
                          ),
                          SizedBox(height: compactHeight ? 16 : 24),
                          Text(
                            'www.setservice.az',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: BrandColors.mutedBrown,
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                        ],
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
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BrandColors.white.withValues(alpha: 0.98),
      elevation: 0,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 104),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: BrandColors.accentGold.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: BrandColors.primaryBurgundy.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(17),
                ),
                child: Icon(
                  icon,
                  color: BrandColors.primaryBurgundy,
                  size: 26,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            color: BrandColors.darkText,
                            fontWeight: FontWeight.w800,
                            height: 1.12,
                          ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      subtitle,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: BrandColors.mutedBrown,
                            height: 1.28,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.arrow_forward_ios_rounded,
                size: 17,
                color: BrandColors.primaryBurgundy,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
