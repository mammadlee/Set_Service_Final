import 'package:flutter/material.dart';

class ContentReportInput {
  const ContentReportInput({required this.reason, required this.details});

  final String reason;
  final String details;
}

Future<ContentReportInput?> showContentReportDialog(
  BuildContext context, {
  required String subjectLabel,
}) {
  return showDialog<ContentReportInput>(
    context: context,
    builder: (_) => _ContentReportDialog(subjectLabel: subjectLabel),
  );
}

class _ContentReportDialog extends StatefulWidget {
  const _ContentReportDialog({required this.subjectLabel});

  final String subjectLabel;

  @override
  State<_ContentReportDialog> createState() => _ContentReportDialogState();
}

class _ContentReportDialogState extends State<_ContentReportDialog> {
  final _details = TextEditingController();
  String _reason = 'inappropriate_content';

  static const _reasons = <String, String>{
    'inappropriate_content': 'Uyğunsuz məzmun',
    'harassment': 'Təhqir və ya təzyiq',
    'false_information': 'Yanlış və ya saxta məlumat',
    'spam': 'Spam',
    'privacy': 'Məxfilik pozuntusu',
    'other': 'Digər',
  };

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('${widget.subjectLabel} şikayət et'),
      scrollable: true,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          DropdownButtonFormField<String>(
            value: _reason,
            decoration: const InputDecoration(labelText: 'Səbəb'),
            items: _reasons.entries
                .map(
                  (entry) => DropdownMenuItem(
                    value: entry.key,
                    child: Text(entry.value),
                  ),
                )
                .toList(growable: false),
            onChanged: (value) => setState(
              () => _reason = value ?? 'inappropriate_content',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _details,
            minLines: 3,
            maxLines: 5,
            maxLength: 1000,
            decoration: const InputDecoration(
              labelText: 'Əlavə məlumat',
              hintText: 'Problemi qısa şəkildə izah edin.',
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Şikayət SET Service admin komandası tərəfindən yoxlanılacaq.',
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Ləğv et'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(
            ContentReportInput(
              reason: _reason,
              details: _details.text.trim(),
            ),
          ),
          child: const Text('Şikayət et'),
        ),
      ],
    );
  }
}
