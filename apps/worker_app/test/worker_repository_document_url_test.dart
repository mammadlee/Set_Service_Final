import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/features/worker/data/worker_repository.dart';

void main() {
  group('WorkerRepository.resolveDocumentDownloadUrl', () {
    const apiBaseUrl = 'https://api.setservice.az/v1';

    test('resolves the relative URL returned by local document storage', () {
      final result = WorkerRepository.resolveDocumentDownloadUrl(
        '/v1/private-worker-documents/signed-token',
        apiBaseUrl: apiBaseUrl,
      );

      expect(
        result,
        Uri.parse(
          'https://api.setservice.az/v1/private-worker-documents/signed-token',
        ),
      );
    });

    test('keeps absolute object-storage signed URLs intact', () {
      final result = WorkerRepository.resolveDocumentDownloadUrl(
        'https://objects.example.test/document.pdf?signature=abc',
        apiBaseUrl: apiBaseUrl,
      );

      expect(
        result,
        Uri.parse('https://objects.example.test/document.pdf?signature=abc'),
      );
    });

    test('rejects unsupported or authority-relative URLs', () {
      expect(
        WorkerRepository.resolveDocumentDownloadUrl(
          'file:///private/document.pdf',
          apiBaseUrl: apiBaseUrl,
        ),
        isNull,
      );
      expect(
        WorkerRepository.resolveDocumentDownloadUrl(
          '//untrusted.example.test/document.pdf',
          apiBaseUrl: apiBaseUrl,
        ),
        isNull,
      );
    });
  });
}
