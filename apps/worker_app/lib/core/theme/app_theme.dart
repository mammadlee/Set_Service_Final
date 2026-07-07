import 'package:flutter/material.dart';

class BrandColors {
  const BrandColors._();

  static const primaryBurgundy = Color(0xFF8A1818);
  static const darkBurgundy = Color(0xFF8A1818);
  static const deepBurgundy = Color(0xFF8A1818);
  static const accentGold = Color(0xFFE3C189);
  static const urbanGraphite = Color(0xFF585858);
  static const creamBackground = Color(0xFFF7F2E9);
  static const cardCream = Color(0xFFF7F2E9);
  static const softBeige = Color(0xFFE3C189);
  static const darkText = Color(0xFF585858);
  static const mutedBrown = Color(0xFF585858);
  static const success = Color(0xFFE3C189);
  static const warning = Color(0xFF585858);
  static const error = Color(0xFF8A1818);
  static const white = Color(0xFFF7F2E9);
  static const transparent = Color(0x00000000);
}

class AppTheme {
  static ThemeData light() {
    const colorScheme = ColorScheme.light(
      primary: BrandColors.primaryBurgundy,
      onPrimary: BrandColors.white,
      primaryContainer: BrandColors.softBeige,
      onPrimaryContainer: BrandColors.darkBurgundy,
      secondary: BrandColors.accentGold,
      onSecondary: BrandColors.darkText,
      secondaryContainer: BrandColors.softBeige,
      onSecondaryContainer: BrandColors.darkText,
      tertiary: BrandColors.urbanGraphite,
      onTertiary: BrandColors.white,
      tertiaryContainer: BrandColors.accentGold,
      onTertiaryContainer: BrandColors.urbanGraphite,
      surface: BrandColors.cardCream,
      onSurface: BrandColors.darkText,
      surfaceDim: BrandColors.creamBackground,
      surfaceBright: BrandColors.creamBackground,
      surfaceContainerLowest: BrandColors.creamBackground,
      surfaceContainerLow: BrandColors.creamBackground,
      surfaceContainer: BrandColors.creamBackground,
      surfaceContainerHigh: BrandColors.creamBackground,
      surfaceContainerHighest: BrandColors.softBeige,
      onSurfaceVariant: BrandColors.mutedBrown,
      error: BrandColors.error,
      onError: BrandColors.white,
      errorContainer: BrandColors.primaryBurgundy,
      onErrorContainer: BrandColors.creamBackground,
      outline: BrandColors.softBeige,
      outlineVariant: BrandColors.accentGold,
      inverseSurface: BrandColors.urbanGraphite,
      onInverseSurface: BrandColors.creamBackground,
      inversePrimary: BrandColors.accentGold,
      shadow: BrandColors.urbanGraphite,
      scrim: BrandColors.urbanGraphite,
      surfaceTint: BrandColors.transparent,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      fontFamily: 'Inter',
    );
    final textTheme = base.textTheme.apply(
      fontFamily: 'Inter',
      bodyColor: BrandColors.darkText,
      displayColor: BrandColors.darkText,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      fontFamily: 'Inter',
      scaffoldBackgroundColor: BrandColors.creamBackground,
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder(),
          TargetPlatform.linux: FadeUpwardsPageTransitionsBuilder(),
        },
      ),
      textTheme: textTheme.copyWith(
        displaySmall: textTheme.displaySmall?.copyWith(
          fontWeight: FontWeight.w700,
          height: 1.08,
          letterSpacing: 0,
        ),
        headlineSmall: textTheme.headlineSmall?.copyWith(
          fontWeight: FontWeight.w700,
          height: 1.12,
          letterSpacing: 0,
        ),
        headlineMedium: textTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w700,
          height: 1.1,
          letterSpacing: 0,
        ),
        titleLarge: textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          height: 1.18,
          letterSpacing: 0,
        ),
        titleMedium: textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w600,
          letterSpacing: 0,
        ),
        bodyMedium: textTheme.bodyMedium?.copyWith(letterSpacing: 0),
        bodyLarge: textTheme.bodyLarge?.copyWith(letterSpacing: 0),
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: false,
        backgroundColor: BrandColors.creamBackground,
        foregroundColor: BrandColors.darkText,
        elevation: 0,
        surfaceTintColor: BrandColors.transparent,
        titleTextStyle: TextStyle(
          color: BrandColors.darkText,
          fontWeight: FontWeight.w700,
          fontSize: 20,
          letterSpacing: 0,
        ),
      ),
      cardTheme: CardThemeData(
        color: BrandColors.cardCream,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(
            color: BrandColors.accentGold.withValues(alpha: 0.58),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BrandColors.white,
        labelStyle: const TextStyle(color: BrandColors.mutedBrown),
        hintStyle: const TextStyle(color: BrandColors.mutedBrown),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: BorderSide(
            color: BrandColors.softBeige.withValues(alpha: 0.8),
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: BorderSide(
            color: BrandColors.softBeige.withValues(alpha: 0.85),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: const BorderSide(
            color: BrandColors.accentGold,
            width: 1.5,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: const BorderSide(color: BrandColors.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: const BorderSide(color: BrandColors.error, width: 1.4),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BrandColors.primaryBurgundy,
          foregroundColor: BrandColors.white,
          minimumSize: const Size.fromHeight(62),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(30),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w500),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BrandColors.primaryBurgundy,
          minimumSize: const Size.fromHeight(60),
          side: const BorderSide(color: BrandColors.accentGold),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(30),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: BrandColors.primaryBurgundy,
          textStyle: const TextStyle(fontWeight: FontWeight.w500),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: BrandColors.white.withValues(alpha: 0.96),
        indicatorColor: BrandColors.primaryBurgundy.withValues(alpha: 0.12),
        indicatorShape: const CircleBorder(),
        elevation: 0,
        height: 100,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(
              color: BrandColors.primaryBurgundy,
              size: 34,
            );
          }
          return const IconThemeData(
            color: BrandColors.urbanGraphite,
            size: 33,
          );
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          final color = selected
              ? BrandColors.primaryBurgundy
              : BrandColors.urbanGraphite;
          return TextStyle(
            color: color,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            fontSize: 13,
            letterSpacing: 0,
          );
        }),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: BrandColors.white,
        surfaceTintColor: BrandColors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return BrandColors.primaryBurgundy;
            }
            return BrandColors.white;
          }),
          foregroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return BrandColors.white;
            }
            return BrandColors.darkText;
          }),
          side: WidgetStateProperty.resolveWith((states) {
            final color = states.contains(WidgetState.selected)
                ? BrandColors.primaryBurgundy
                : BrandColors.accentGold.withValues(alpha: 0.38);
            return BorderSide(color: color);
          }),
          shape: WidgetStateProperty.all(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: BrandColors.urbanGraphite,
        titleTextStyle: TextStyle(
          color: BrandColors.darkText,
          fontWeight: FontWeight.w600,
          fontSize: 16,
        ),
        subtitleTextStyle: TextStyle(
          color: BrandColors.mutedBrown,
          fontSize: 14,
          height: 1.28,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: BrandColors.darkBurgundy,
        contentTextStyle: const TextStyle(color: BrandColors.white),
        actionTextColor: BrandColors.accentGold,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: BrandColors.primaryBurgundy,
      ),
      dividerTheme: const DividerThemeData(color: BrandColors.softBeige),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: BrandColors.primaryBurgundy,
        foregroundColor: BrandColors.white,
      ),
    );
  }
}
