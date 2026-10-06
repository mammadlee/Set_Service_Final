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
  static const _contactFreeArtworkHeight = 2100.0;
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
                                Positioned(
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  height: _contactFreeArtworkHeight,
                                  child: ClipRect(
                                    key: const ValueKey(
                                      'role-selection-contact-free-artwork',
                                    ),
                                    child: Align(
                                      alignment: Alignment.topCenter,
                                      child: SizedBox(
                                        width: _designSize.width,
                                        height: _designSize.height,
                                        child: Image.asset(
                                          _backgroundAsset,
                                          fit: BoxFit.fill,
                                          filterQuality: FilterQuality.high,
                                        ),
                                      ),
                                    ),
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
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: _ContactFooter(onOpen: _openExternalUri),
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

class _ContactFooter extends StatelessWidget {
  const _ContactFooter({required this.onOpen});

  final Future<void> Function(BuildContext context, Uri uri) onOpen;

  @override
  Widget build(BuildContext context) {
    final links = <_ContactLinkData>[
      _ContactLinkData(
        key: const ValueKey('contact-website'),
        icon: Icons.language_rounded,
        label: AppStrings.website,
        uri: RoleSelectionScreen._websiteUri,
      ),
      _ContactLinkData(
        key: const ValueKey('contact-facebook'),
        icon: Icons.facebook_rounded,
        label: AppStrings.contactFacebook,
        uri: RoleSelectionScreen._facebookUri,
      ),
      _ContactLinkData(
        key: const ValueKey('contact-instagram'),
        icon: Icons.camera_alt_outlined,
        label: AppStrings.contactInstagram,
        uri: RoleSelectionScreen._instagramUri,
      ),
      _ContactLinkData(
        key: const ValueKey('contact-phone'),
        icon: Icons.phone_outlined,
        label: AppStrings.contactPhone,
        uri: RoleSelectionScreen._phoneUri,
      ),
    ];

    return Material(
      key: const ValueKey('role-selection-contact-footer'),
      color: BrandColors.transparent,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFF4E3), Color(0xFFFFEED0)],
          ),
          boxShadow: [
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 10,
              offset: Offset(0, -2),
            ),
          ],
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            const spacing = 8.0;
            final horizontalPadding = constraints.maxWidth < 360 ? 8.0 : 12.0;
            final verticalPadding = constraints.maxWidth >= 720 ? 18.0 : 10.0;
            final availableWidth =
                constraints.maxWidth - (horizontalPadding * 2);
            final columns = constraints.maxWidth >= 720 ? 4 : 2;
            final itemWidth =
                (availableWidth - (spacing * (columns - 1))) / columns;

            return Padding(
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                verticalPadding,
                horizontalPadding,
                verticalPadding,
              ),
              child: Wrap(
                spacing: spacing,
                runSpacing: spacing,
                children: [
                  for (final link in links)
                    SizedBox(
                      width: itemWidth,
                      child: _ContactLink(
                        data: link,
                        onTap: () => onOpen(context, link.uri),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _ContactLinkData {
  const _ContactLinkData({
    required this.key,
    required this.icon,
    required this.label,
    required this.uri,
  });

  final Key key;
  final IconData icon;
  final String label;
  final Uri uri;
}

class _ContactLink extends StatelessWidget {
  const _ContactLink({required this.data, required this.onTap});

  final _ContactLinkData data;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      link: true,
      label: data.label,
      child: Material(
        color: const Color(0xBFFFFFFF),
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          key: data.key,
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(data.icon, size: 19, color: BrandColors.primaryBurgundy),
                  const SizedBox(width: 7),
                  Flexible(
                    child: Text(
                      data.label,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: BrandColors.urbanGraphite,
                        fontSize: 12,
                        height: 1.2,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
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
