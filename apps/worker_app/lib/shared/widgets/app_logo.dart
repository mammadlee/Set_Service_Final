import 'package:flutter/material.dart';

import '../app_strings.dart';

class AppLogo extends StatelessWidget {
  const AppLogo({this.size = 42, this.showText = true, super.key});

  final double size;
  final bool showText;

  static const _assetPath = 'assets/brand/set_app_logo.png';

  @override
  Widget build(BuildContext context) {
    final width = showText ? size * 3.9 : size;
    final height = showText ? size * 2.5 : size;

    return Semantics(
      label: AppStrings.brandName,
      image: true,
      child: Image.asset(
        _assetPath,
        width: width,
        height: height,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
        errorBuilder: (context, error, stackTrace) {
          return Text(
            AppStrings.brandName,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          );
        },
      ),
    );
  }
}
