import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../worker/data/worker_repository.dart';
import '../../../worker/presentation/screens/worker_profile_screen.dart';
import '../../data/models/auth_models.dart';

/// Uses only the short-lived registration token; never opens the worker app.
class EnrollmentDocumentsSection extends StatefulWidget {
  const EnrollmentDocumentsSection({required this.token, super.key});

  final String token;

  @override
  State<EnrollmentDocumentsSection> createState() =>
      _EnrollmentDocumentsSectionState();
}

class _EnrollmentDocumentsSectionState
    extends State<EnrollmentDocumentsSection> {
  WorkerMe? _worker;
  String? _error;
  bool _loading = true;
  bool _uploading = false;
  double? _progress;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final worker = await context
          .read<WorkerRepository>()
          .getEnrollmentProfile(widget.token);
      if (mounted) setState(() => _worker = worker);
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _upload(String type) async {
    if (_uploading) return;
    setState(() {
      _uploading = true;
      _error = null;
      _progress = null;
    });
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
        allowMultiple: false,
        withData: kIsWeb,
      );
      if (!mounted || result == null) return;
      final file = result.files.single;
      final repository = context.read<WorkerRepository>();
      await repository.uploadDocument(
        type: type,
        fileName: file.name,
        bytes: file.bytes,
        path: file.path,
        fileSize: file.size,
        enrollmentToken: widget.token,
        onSendProgress: (sent, total) {
          if (mounted && total > 0) setState(() => _progress = sent / total);
        },
      );
      final refreshed = await repository.getEnrollmentProfile(widget.token);
      if (mounted) setState(() => _worker = refreshed);
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    } finally {
      if (mounted) {
        setState(() {
          _uploading = false;
          _progress = null;
        });
      }
    }
  }

  Future<void> _open(WorkerDocument document) async {
    try {
      final uri = await context.read<WorkerRepository>().getDocumentDownloadUrl(
        workerId: _worker!.id,
        type: document.type,
        enrollmentToken: widget.token,
      );
      if (!mounted) return;
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw const ApiException(
          message: 'Sənəd açıla bilmədi. Yenidən cəhd edin.',
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = _message(error));
    }
  }

  String _message(Object error) => error is ApiException
      ? error.message
      : 'Sənədlər yüklənmədi. Yenidən cəhd edin.';

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final worker = _worker;
    if (worker == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InlineMessage(
            message: _error ?? 'Sənədlər yüklənmədi.',
            kind: InlineMessageKind.error,
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _load,
            child: const Text('Yenidən cəhd et'),
          ),
        ],
      );
    }
    final complete = const ['health_certificate', 'criminal_record'].every(
      (type) => worker.documents.any(
        (doc) => doc.type == type && doc.available && doc.scanStatus == 'clean',
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InlineMessage(
          message: complete
              ? 'Tələb olunan arayışlar yüklənib. Admin təsdiqi gözlənilir.'
              : 'Admin təsdiqi üçün sağlamlıq və məhkumluq arayışlarını yükləyin. PDF, JPG və PNG, ən çox 5 MB.',
          kind: complete ? InlineMessageKind.success : InlineMessageKind.info,
        ),
        const SizedBox(height: 16),
        WorkerDocumentsSection(
          worker: worker,
          uploading: _uploading,
          uploadProgress: _progress,
          errorMessage: _error,
          successMessage: null,
          onUploadHealthCertificate: () => _upload('health_certificate'),
          onUploadCriminalRecord: () => _upload('criminal_record'),
          onOpenDocument: _open,
        ),
      ],
    );
  }
}
