import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/storage/secure_storage_config.dart';
import '../../core/theme/app_theme.dart';
import '../legal_links.dart';
import 'constrained_page.dart';
import 'inline_message.dart';

class LegalConsentGate extends StatefulWidget {
  const LegalConsentGate({
    required this.roleKey,
    required this.child,
    super.key,
  });

  final String roleKey;
  final Widget child;

  @override
  State<LegalConsentGate> createState() => _LegalConsentGateState();
}

class _LegalConsentGateState extends State<LegalConsentGate> {
  bool _loading = true;
  bool _accepted = false;
  bool _checked = false;
  String? _error;

  String get _storageKey => 'setservice_legal_acceptance_v1_${widget.roleKey}';

  @override
  void initState() {
    super.initState();
    _loadAcceptance();
  }

  Future<void> _loadAcceptance() async {
    try {
      final value = await SecureStorageConfig.storage.read(key: _storageKey);
      if (!mounted) return;
      setState(() => _accepted = value?.isNotEmpty == true);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Hüquqi razılıq statusu yoxlanılmadı.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _accept() async {
    if (!_checked) return;
    setState(() => _error = null);
    try {
      await SecureStorageConfig.storage.write(
        key: _storageKey,
        value: DateTime.now().toUtc().toIso8601String(),
      );
      if (mounted) setState(() => _accepted = true);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Razılıq yadda saxlanılmadı. Yenidən cəhd edin.');
      }
    }
  }

  Future<void> _open(Uri uri) async {
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      setState(() => _error = 'Səhifəni açmaq mümkün olmadı.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (_accepted) return widget.child;

    return Scaffold(
      appBar: AppBar(title: const Text('İstifadə qaydaları')),
      body: ConstrainedPage(
        showBackdrop: true,
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 24),
          children: [
            Icon(
              Icons.verified_user_outlined,
              size: 72,
              color: BrandColors.primaryBurgundy,
            ),
            const SizedBox(height: 20),
            Text(
              'SET Service-dən istifadə şərtləri',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Davam etməzdən əvvəl İstifadə Qaydaları və Məxfilik Siyasəti ilə tanış olun. '
              'Platformada təhqir, təhdid, ayrı-seçkilik, spam, saxta və qanunsuz məzmun qadağandır.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 18),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: [
                TextButton.icon(
                  onPressed: () => _open(LegalLinks.terms),
                  icon: const Icon(Icons.description_outlined),
                  label: const Text('İstifadə Qaydaları'),
                ),
                TextButton.icon(
                  onPressed: () => _open(LegalLinks.privacy),
                  icon: const Icon(Icons.privacy_tip_outlined),
                  label: const Text('Məxfilik Siyasəti'),
                ),
              ],
            ),
            const SizedBox(height: 10),
            CheckboxListTile(
              value: _checked,
              onChanged: (value) => setState(() => _checked = value ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              title: const Text(
                'İstifadə Qaydalarını qəbul edirəm və Məxfilik Siyasəti ilə tanış olmuşam.',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              InlineMessage(message: _error!, kind: InlineMessageKind.error),
            ],
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _checked ? _accept : null,
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Qəbul et və davam et'),
            ),
          ],
        ),
      ),
    );
  }
}
