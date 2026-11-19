import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../legal_links.dart';

class LegalAcceptanceCheckbox extends StatelessWidget {
  const LegalAcceptanceCheckbox({
    required this.value,
    required this.onChanged,
    super.key,
  });

  final bool value;
  final ValueChanged<bool> onChanged;

  Future<void> _open(BuildContext context, Uri uri) async {
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Səhifəni açmaq mümkün olmadı.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        CheckboxListTile(
          value: value,
          onChanged: (selected) => onChanged(selected ?? false),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text(
            'İstifadə Qaydalarını qəbul edirəm və Məxfilik Siyasəti ilə tanış olmuşam.',
          ),
        ),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          children: [
            TextButton(
              onPressed: () => _open(context, LegalLinks.terms),
              child: const Text('İstifadə Qaydaları'),
            ),
            TextButton(
              onPressed: () => _open(context, LegalLinks.privacy),
              child: const Text('Məxfilik Siyasəti'),
            ),
          ],
        ),
      ],
    );
  }
}
