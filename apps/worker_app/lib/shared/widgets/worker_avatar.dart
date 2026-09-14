import 'package:flutter/material.dart';

import '../../core/config/app_config.dart';
import '../../core/theme/app_theme.dart';

String? resolvePublicAssetUrl(String? value, {String? baseUrl}) {
  final cleaned = value?.trim();
  if (cleaned == null || cleaned.isEmpty) return null;

  final uri = Uri.tryParse(cleaned);
  if (uri != null &&
      uri.isAbsolute &&
      (uri.scheme == 'http' || uri.scheme == 'https') &&
      uri.host.isNotEmpty &&
      uri.userInfo.isEmpty) {
    return uri.toString();
  }
  if (uri == null) return null;
  if (uri.hasScheme || uri.hasAuthority) return null;
  if (cleaned.startsWith('//')) return null;

  final configuredBase = (baseUrl ?? AppConfig.rawBaseUrl).trim();
  final parsedBase = Uri.tryParse(configuredBase);
  if (parsedBase == null ||
      !parsedBase.isAbsolute ||
      parsedBase.host.isEmpty ||
      parsedBase.userInfo.isNotEmpty) {
    return null;
  }
  final base = parsedBase.replace(
    path: parsedBase.path.endsWith('/')
        ? parsedBase.path
        : '${parsedBase.path}/',
  );
  final resolved = base.resolveUri(uri);
  if ((resolved.scheme != 'http' && resolved.scheme != 'https') ||
      resolved.host.isEmpty ||
      resolved.userInfo.isNotEmpty) {
    return null;
  }
  return resolved.toString();
}

class WorkerAvatar extends StatelessWidget {
  const WorkerAvatar({
    required this.name,
    this.photoUrl,
    this.radius = 40,
    this.backgroundColor,
    this.foregroundColor,
    this.borderColor,
    this.showLoadingIndicator = true,
    super.key,
  });

  final String name;
  final String? photoUrl;
  final double radius;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final Color? borderColor;
  final bool showLoadingIndicator;

  @override
  Widget build(BuildContext context) {
    final resolvedUrl = resolvePublicAssetUrl(photoUrl);
    final fallback = _AvatarFallback(
      name: name,
      foregroundColor: foregroundColor ?? BrandColors.primaryBurgundy,
    );

    return Semantics(
      image: resolvedUrl != null,
      label: resolvedUrl == null
          ? '$name üçün profil şəkli yoxdur'
          : '$name profil şəkli',
      child: Container(
        key: const ValueKey('worker-avatar-frame'),
        width: radius * 2,
        height: radius * 2,
        padding: borderColor == null
            ? EdgeInsets.zero
            : const EdgeInsets.all(2),
        decoration: BoxDecoration(shape: BoxShape.circle, color: borderColor),
        child: ClipOval(
          child: ColoredBox(
            color:
                backgroundColor ??
                BrandColors.accentGold.withValues(alpha: 0.18),
            child: resolvedUrl == null
                ? fallback
                : Image.network(
                    resolvedUrl,
                    key: ValueKey('worker-avatar-$resolvedUrl'),
                    width: radius * 2,
                    height: radius * 2,
                    fit: BoxFit.cover,
                    filterQuality: FilterQuality.medium,
                    frameBuilder:
                        (context, child, frame, wasSynchronouslyLoaded) {
                          if (wasSynchronouslyLoaded || frame != null) {
                            return child;
                          }
                          return Stack(
                            fit: StackFit.expand,
                            children: [
                              fallback,
                              if (showLoadingIndicator)
                                Center(
                                  child: SizedBox.square(
                                    dimension: radius * 0.42,
                                    child: const CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  ),
                                ),
                            ],
                          );
                        },
                    errorBuilder: (_, __, ___) => fallback,
                  ),
          ),
        ),
      ),
    );
  }
}

class _AvatarFallback extends StatelessWidget {
  const _AvatarFallback({required this.name, required this.foregroundColor});

  final String name;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part.characters.first.toUpperCase())
        .join();

    if (initials.isEmpty) {
      return Icon(Icons.person_outline, color: foregroundColor, size: 34);
    }
    return Center(
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          initials,
          style: TextStyle(
            color: foregroundColor,
            fontWeight: FontWeight.w800,
            fontSize: 24,
            letterSpacing: 0.4,
          ),
        ),
      ),
    );
  }
}
