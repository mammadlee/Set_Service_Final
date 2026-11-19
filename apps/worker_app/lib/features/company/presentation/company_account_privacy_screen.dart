import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/session/role_session_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/legal_links.dart';
import '../../../shared/widgets/constrained_page.dart';
import '../../../shared/widgets/inline_message.dart';
import 'company_auth_controller.dart';

class CompanyAccountPrivacyScreen extends StatefulWidget {
  const CompanyAccountPrivacyScreen({super.key});

  @override
  State<CompanyAccountPrivacyScreen> createState() =>
      _CompanyAccountPrivacyScreenState();
}

class _CompanyAccountPrivacyScreenState
    extends State<CompanyAccountPrivacyScreen> {
  String? _error;

  Future<void> _open(Uri uri) async {
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      setState(() => _error = 'Səhifəni açmaq mümkün olmadı.');
    }
  }

  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Hesab həmişəlik silinsin?'),
        content: const Text(
          'Bu əməliyyat geri qaytarılmır. Müəssisə hesabı deaktiv ediləcək, '
          'şəxsi əlaqə məlumatları anonimləşdiriləcək və saxlanılan sənədlərin '
          'silinməsi başladılacaq.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Ləğv et'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Hesabı sil'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final deleted = await context.read<CompanyAuthController>().deleteAccount();
    if (!mounted) return;
    if (!deleted) {
      setState(() {
        _error = context.read<CompanyAuthController>().errorMessage ??
            'Hesab silinmədi. Yenidən cəhd edin.';
      });
      return;
    }

    await context.read<RoleSessionController>().clearRole();
    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<CompanyAuthController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Məxfilik və hesab')),
      body: ConstrainedPage(
        showBackdrop: true,
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 18),
          children: [
            ListTile(
              leading: const Icon(Icons.privacy_tip_outlined),
              title: const Text('Məxfilik Siyasəti'),
              trailing: const Icon(Icons.open_in_new),
              onTap: () => _open(LegalLinks.privacy),
            ),
            ListTile(
              leading: const Icon(Icons.description_outlined),
              title: const Text('İstifadə Qaydaları'),
              trailing: const Icon(Icons.open_in_new),
              onTap: () => _open(LegalLinks.terms),
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: const Text('Web hesab silmə səhifəsi'),
              trailing: const Icon(Icons.open_in_new),
              onTap: () => _open(LegalLinks.accountDeletion),
            ),
            const SizedBox(height: 18),
            if (_error != null) ...[
              InlineMessage(message: _error!, kind: InlineMessageKind.error),
              const SizedBox(height: 12),
            ],
            OutlinedButton.icon(
              onPressed: auth.isSubmitting ? null : _deleteAccount,
              icon: auth.isSubmitting
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.delete_forever_outlined),
              label: const Text('Müəssisə hesabını sil'),
              style: OutlinedButton.styleFrom(
                foregroundColor: BrandColors.primaryBurgundy,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
