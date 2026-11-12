import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/session/app_role.dart';
import '../../../core/session/role_session_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/app_strings.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({super.key, this.launchExternalUri});

  static const _backgroundAsset = 'assets/brand/role_selection_background.png';
  static const _designSize = Size(1080, 2338);
  static const _maxArtworkWidth = 430.0;
  static const _minimumReadableWidth = 288.0;
  static final _websiteUri = Uri.parse('https://www.setservice.az');
  static final _facebookUri = Uri.parse(
    'https://www.facebook.com/setservice.az/',
  );
  static final _instagramUri = Uri.parse(
    'https://www.instagram.com/setservice.az/',
  );
  static final _phoneUri = Uri.parse('tel:+994702315151');

  final Future<bool> Function(Uri uri)? launchExternalUri;

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
              final availableSize = Size(
                constraints.maxWidth,
                constraints.maxHeight,
              );
              final cappedWidth = math.min(
                availableSize.width,
                _maxArtworkWidth,
              );
              final fittedWidth = math.min(
                cappedWidth,
                availableSize.height * (_designSize.width / _designSize.height),
              );
              final shouldScroll =
                  fittedWidth < math.min(cappedWidth, _minimumReadableWidth);
              final landscape = availableSize.width > availableSize.height;
              final scrollWidth = math.min(
                cappedWidth,
                landscape ? 320.0 : availableSize.width,
              );

              final artwork = _RoleArtwork(
                onOpen: _openExternalUri,
                onAdmin: () => context.read<RoleSessionController>().selectRole(
                  AppRole.admin,
                ),
                onWorker: () => context
                    .read<RoleSessionController>()
                    .selectRole(AppRole.worker),
                onCompany: () => context
                    .read<RoleSessionController>()
                    .selectRole(AppRole.company),
              );

              return Stack(
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
                  if (shouldScroll)
                    SingleChildScrollView(
                      key: const ValueKey('role-selection-scroll'),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Center(
                        child: SizedBox(
                          key: const ValueKey('role-selection-artwork'),
                          width: scrollWidth,
                          height:
                              scrollWidth *
                              (_designSize.height / _designSize.width),
                          child: artwork,
                        ),
                      ),
                    )
                  else
                    Center(
                      child: SizedBox(
                        key: const ValueKey('role-selection-artwork'),
                        width: fittedWidth,
                        height:
                            fittedWidth *
                            (_designSize.height / _designSize.width),
                        child: artwork,
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _openExternalUri(BuildContext context, Uri uri) async {
    try {
      final didLaunch =
          await (launchExternalUri?.call(uri) ??
              launchUrl(uri, mode: LaunchMode.externalApplication));
      if (!didLaunch && context.mounted) {
        _showLaunchError(context);
      }
    } catch (_) {
      if (context.mounted) {
        _showLaunchError(context);
      }
    }
  }

  void _showLaunchError(BuildContext context) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text(AppStrings.contactLinkFailed)));
  }
}

class _RoleArtwork extends StatelessWidget {
  const _RoleArtwork({
    required this.onOpen,
    required this.onAdmin,
    required this.onWorker,
    required this.onCompany,
  });

  final Future<void> Function(BuildContext context, Uri uri) onOpen;
  final VoidCallback onAdmin;
  final VoidCallback onWorker;
  final VoidCallback onCompany;

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.fill,
      child: SizedBox(
        key: const ValueKey('role-selection-design-canvas'),
        width: RoleSelectionScreen._designSize.width,
        height: RoleSelectionScreen._designSize.height,
        child: Stack(
          children: [
            Positioned.fill(
              child: Image.asset(
                RoleSelectionScreen._backgroundAsset,
                key: const ValueKey('role-selection-background-image'),
                fit: BoxFit.fill,
                filterQuality: FilterQuality.high,
              ),
            ),
            _RoleHitTarget(
              rect: const Rect.fromLTWH(260, 135, 560, 385),
              label: AppStrings.adminLogin,
              onLongPress: onAdmin,
            ),
            _RoleHitTarget(
              rect: const Rect.fromLTWH(124, 1055, 890, 220),
              label: AppStrings.continueAsWorker,
              onTap: onWorker,
            ),
            _RoleHitTarget(
              rect: const Rect.fromLTWH(124, 1337, 890, 220),
              label: AppStrings.continueAsCompany,
              onTap: onCompany,
            ),
            const Positioned(
              left: 0,
              right: 0,
              top: 1980,
              bottom: 0,
              child: DecoratedBox(
                key: ValueKey('role-selection-contact-mask'),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0x00FFF4E3),
                      Color(0xFFFFF1DA),
                      Color(0xFFFFEAC7),
                    ],
                    stops: [0, 0.27, 1],
                  ),
                ),
              ),
            ),
            const _ContactCard(
              rect: Rect.fromLTWH(238, 2042, 604, 108),
              icon: Icons.language_rounded,
              label: AppStrings.website,
            ),
            const _ContactCard(
              rect: Rect.fromLTWH(34, 2190, 310, 116),
              icon: Icons.facebook_rounded,
              label: AppStrings.contactFacebook,
            ),
            const _ContactCard(
              rect: Rect.fromLTWH(354, 2190, 372, 116),
              icon: Icons.phone_outlined,
              label: AppStrings.contactPhone,
            ),
            const _ContactCard(
              rect: Rect.fromLTWH(736, 2190, 310, 116),
              icon: Icons.camera_alt_outlined,
              label: AppStrings.contactInstagram,
            ),
            _ContactHitTarget(
              key: const ValueKey('contact-website'),
              rect: const Rect.fromLTWH(200, 2000, 680, 174),
              label: AppStrings.website,
              onTap: () => onOpen(context, RoleSelectionScreen._websiteUri),
            ),
            _ContactHitTarget(
              key: const ValueKey('contact-facebook'),
              rect: const Rect.fromLTWH(0, 2168, 350, 170),
              label: AppStrings.contactFacebook,
              onTap: () => onOpen(context, RoleSelectionScreen._facebookUri),
            ),
            _ContactHitTarget(
              key: const ValueKey('contact-phone'),
              rect: const Rect.fromLTWH(350, 2168, 380, 170),
              label: AppStrings.contactPhone,
              onTap: () => onOpen(context, RoleSelectionScreen._phoneUri),
            ),
            _ContactHitTarget(
              key: const ValueKey('contact-instagram'),
              rect: const Rect.fromLTWH(730, 2168, 350, 170),
              label: AppStrings.contactInstagram,
              onTap: () => onOpen(context, RoleSelectionScreen._instagramUri),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  const _ContactCard({
    required this.rect,
    required this.icon,
    required this.label,
  });

  final Rect rect;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Positioned.fromRect(
      rect: rect,
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: const Color(0xD9FFFFFF),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: const Color(0x66F0B44D), width: 2),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 38, color: BrandColors.primaryBurgundy),
                const SizedBox(width: 16),
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      label,
                      maxLines: 1,
                      style: const TextStyle(
                        color: BrandColors.urbanGraphite,
                        fontSize: 34,
                        height: 1.1,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
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

class _ContactHitTarget extends StatelessWidget {
  const _ContactHitTarget({
    required this.rect,
    required this.label,
    required this.onTap,
    super.key,
  });

  final Rect rect;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Positioned.fromRect(
      rect: rect,
      child: Semantics(
        button: true,
        link: true,
        label: label,
        child: Material(
          color: BrandColors.transparent,
          child: InkWell(onTap: onTap),
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
