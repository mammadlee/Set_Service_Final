import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../app_strings.dart';
import 'premium_components.dart';

Future<bool> showCheckoutConfirmationDialog(BuildContext context) async {
  final confirmed = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) => Dialog(
      backgroundColor: BrandColors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
      child: SafeArea(
        child: SingleChildScrollView(
          child: PremiumCard(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: BrandColors.accentGold.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Icon(
                        Icons.logout_outlined,
                        color: BrandColors.primaryBurgundy,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        AppStrings.checkoutConfirmTitle,
                        softWrap: true,
                        style: Theme.of(dialogContext).textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  AppStrings.checkoutConfirmMessage,
                  style: Theme.of(dialogContext).textTheme.bodyMedium?.copyWith(
                    color: BrandColors.urbanGraphite,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: PremiumActionButton(
                    label: AppStrings.checkoutConfirmAction,
                    icon: Icons.logout_outlined,
                    onPressed: () => Navigator.of(dialogContext).pop(true),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(dialogContext).pop(false),
                    child: const Text(AppStrings.cancel),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  return confirmed == true;
}
