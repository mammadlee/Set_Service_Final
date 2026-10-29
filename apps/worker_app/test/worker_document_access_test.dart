import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/network/api_exception.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/features/auth/data/models/auth_models.dart';
import 'package:worker_app/features/auth/presentation/screens/enrollment_documents_section.dart';
import 'package:worker_app/features/company/data/company_repository.dart';
import 'package:worker_app/features/worker/data/worker_repository.dart';
import 'package:worker_app/features/worker/presentation/screens/worker_profile_screen.dart';
import 'package:worker_app/shared/models/mobile_models.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'unavailable upload validator returns a localized retry message',
    () async {
      final fixture = _Fixture((request) async {
        expect(request.path, '/workers/me/documents');
        return _response(503, {
          'code': 'UPLOAD_VALIDATOR_UNAVAILABLE',
          'error': 'PDF validation service is unavailable.',
        });
      });
      await expectLater(
        fixture.worker.uploadDocument(
          type: 'cv',
          fileName: 'cv.pdf',
          bytes: Uint8List.fromList([1, 2, 3]),
        ),
        throwsA(
          isA<ApiException>()
              .having(
                (error) => error.code,
                'code',
                'UPLOAD_VALIDATOR_UNAVAILABLE',
              )
              .having(
                (error) => error.message,
                'message',
                'Sənədin təhlükəsizlik yoxlaması hazırda mümkün deyil. Bir az sonra yenidən cəhd edin.',
              ),
        ),
      );
    },
  );

  for (final type in ['cv', 'health_certificate', 'criminal_record']) {
    test('$type requests a new authorized URL for every opening', () async {
      var opens = 0;
      final fixture = _Fixture((request) async {
        expect(request.path, '/workers/worker-1/documents/$type/download');
        expect(request.headers['authorization'], startsWith('Bearer '));
        expect(request.headers['Cache-Control'], 'no-store');
        opens++;
        return _response(200, {'url': _signedUrl(opens)});
      });
      final first = await fixture.worker.getDocumentDownloadUrl(
        workerId: 'worker-1',
        type: type,
      );
      final second = await fixture.worker.getDocumentDownloadUrl(
        workerId: 'worker-1',
        type: type,
      );
      expect(first.toString(), _signedUrl(1));
      expect(second.toString(), _signedUrl(2));
      expect(opens, 2);
    });
  }

  test(
    'expired download response is renewed once and never returned',
    () async {
      var calls = 0;
      final fixture = _Fixture((_) async {
        calls++;
        return _response(200, {
          'url': _signedUrl(calls),
          'expires_at': calls == 1
              ? '2000-01-01T00:00:00Z'
              : '2100-01-01T00:00:00Z',
        });
      });
      expect(
        (await fixture.worker.getDocumentDownloadUrl(
          workerId: 'worker-1',
          type: 'cv',
        )).toString(),
        _signedUrl(2),
      );
      expect(calls, 2);
    },
  );

  test('repeated expired response stops with localized error', () async {
    var calls = 0;
    final fixture = _Fixture((_) async {
      calls++;
      return _response(200, {
        'url': _signedUrl(calls),
        'expires_at': '2000-01-01T00:00:00Z',
      });
    });
    await expectLater(
      fixture.worker.getDocumentDownloadUrl(workerId: 'worker-1', type: 'cv'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.code,
          'code',
          'WORKER_DOCUMENT_URL_EXPIRED',
        ),
      ),
    );
    expect(calls, 2);
  });

  test(
    'company document download uses company auth and propagates forbidden',
    () async {
      var calls = 0;
      final fixture = _Fixture((request) async {
        expect(
          request.path,
          '/workers/worker-1/documents/health_certificate/download',
        );
        final token = (request.headers['authorization'] as String).substring(7);
        final payload =
            jsonDecode(
                  utf8.decode(
                    base64Url.decode(base64Url.normalize(token.split('.')[1])),
                  ),
                )
                as Map;
        expect(payload['role'], 'company');
        calls++;
        return calls == 1
            ? _response(200, {'url': _signedUrl(1)})
            : _response(403, {
                'code': 'WORKER_DOCUMENT_ACCESS_DENIED',
                'error': 'Access denied',
              });
      }, role: 'company');
      expect(
        (await fixture.company.getWorkerDocumentDownloadUrl(
          workerId: 'worker-1',
          type: 'health_certificate',
        )).toString(),
        _signedUrl(1),
      );
      await expectLater(
        fixture.company.getWorkerDocumentDownloadUrl(
          workerId: 'worker-1',
          type: 'health_certificate',
        ),
        throwsA(
          isA<ApiException>().having(
            (error) => error.message,
            'message',
            'Bu sənədi açmaq üçün icazəniz yoxdur.',
          ),
        ),
      );
      expect(calls, 2);
    },
  );

  for (final entry in {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
  }.entries) {
    test(
      '${entry.key} document upload preserves multipart file MIME and type',
      () async {
        final fixture = _Fixture((request) async {
          expect(request.path, '/workers/me/documents');
          final data = request.data as FormData;
          expect(
            data.fields.any(
              (field) => field.key == 'type' && field.value == 'cv',
            ),
            isTrue,
          );
          expect(data.files.single.key, 'file');
          expect(data.files.single.value.contentType.toString(), entry.value);
          return _response(200, _profile(name: 'new.${entry.key}'));
        });
        final result = await fixture.worker.uploadDocument(
          type: 'cv',
          fileName: 'new.${entry.key}',
          bytes: Uint8List.fromList([1, 2, 3]),
        );
        expect(result.documents.single.name, 'new.${entry.key}');
      },
    );
  }

  testWidgets(
    'legacy metadata never opens raw R2 URL; every tap authorizes again',
    (tester) async {
      final launched = <String>[];
      _mockLauncher(launched);
      var downloads = 0;
      final fixture = _Fixture((request) async {
        expect(request.headers['authorization'], 'Bearer enrollment-only');
        if (request.path == '/workers/me/enrollment') {
          return _response(
            200,
            _profile(type: 'health_certificate', legacy: true),
          );
        }
        expect(
          request.path,
          '/workers/me/documents/health_certificate/download',
        );
        expect(request.headers['Cache-Control'], 'no-store');
        return _response(200, {'url': _signedUrl(++downloads)});
      });
      await tester.pumpWidget(fixture.enrollmentApp());
      await tester.pumpAndSettle();
      expect(find.text('Açılarkən yoxlanılacaq'), findsOneWidget);
      for (var index = 0; index < 2; index++) {
        await tester.tap(find.text('Açmaq üçün toxunun'));
        await tester.pumpAndSettle();
      }
      expect(downloads, 2);
      expect(launched, [_signedUrl(1), _signedUrl(2)]);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'failed replacement preserves old card; successful upload survives failed refresh',
    (tester) async {
      const picker = MethodChannel('miguelruivo.flutter.plugins.filepicker');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            picker,
            (_) async => [
              {
                'name': 'new.pdf',
                'path': 'picked/new.pdf',
                'size': 3,
                'bytes': Uint8List.fromList([1, 2, 3]),
              },
            ],
          );
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(picker, null),
      );
      var uploads = 0;
      final fixture = _Fixture((request) async {
        if (request.path == '/workers/me/enrollment') {
          return uploads == 2
              ? _response(503, {'code': 'INTERNAL_ERROR'})
              : _response(
                  200,
                  _profile(type: 'health_certificate', name: 'old.pdf'),
                );
        }
        expect(request.method, 'POST');
        expect(request.path, '/workers/me/documents');
        uploads++;
        return uploads == 1
            ? _response(422, {
                'code': 'UPLOAD_PDF_ACTIVE_CONTENT',
                'error': 'Active or embedded PDF content is not allowed',
              })
            : _response(
                200,
                _profile(type: 'health_certificate', name: 'new.pdf'),
              );
      });
      await tester.pumpWidget(fixture.enrollmentApp());
      await tester.pumpAndSettle();
      final upload = find.ancestor(
        of: find.text('Sağlamlıq arayışı'),
        matching: find.byWidgetPredicate((widget) => widget is OutlinedButton),
      );
      await tester.tap(upload);
      await tester.pumpAndSettle();
      expect(find.text('old.pdf'), findsOneWidget);
      expect(find.text('new.pdf'), findsNothing);
      expect(find.textContaining('PDF-də təhlükəsiz olmayan'), findsOneWidget);
      await tester.tap(upload);
      await tester.pumpAndSettle();
      expect(find.text('new.pdf'), findsOneWidget);
      expect(find.text('old.pdf'), findsNothing);
      expect(find.textContaining('PDF-də təhlükəsiz olmayan'), findsNothing);
      expect(find.text('Yüklənib'), findsOneWidget);
      expect(uploads, 2);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'CV opens by backend availability without storing a document URL',
    (tester) async {
      var opens = 0;
      final worker = WorkerMe.fromJson(_profile());
      expect(worker.documents.single.effectiveDownloadPath, isNull);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: WorkerCvSection(
              worker: worker,
              uploading: false,
              deleting: false,
              uploadProgress: null,
              errorMessage: null,
              successMessage: null,
              onUpload: () async {},
              onDelete: () async {},
              onOpen: (_) async => opens++,
            ),
          ),
        ),
      );
      await tester.tap(find.text('Bax'));
      expect(opens, 1);
    },
  );

  test(
    'company metadata preserves backend availability and never infers it from raw URL',
    () {
      final ready = CompanyVisibleWorkerDocument.fromJson(
        _document(type: 'health_certificate'),
      );
      expect(ready.canRequestDownload, isTrue);
      final legacy = CompanyVisibleWorkerDocument.fromJson(
        _document(type: 'health_certificate', legacy: true),
      );
      expect(legacy.canRequestDownload, isTrue);
      expect(legacy.displayStatus, 'Açılarkən yoxlanılacaq');
      final unavailable = CompanyVisibleWorkerDocument.fromJson({
        'type': 'cv',
        'url': 'https://objects.example.test/private.pdf',
      });
      expect(unavailable.canRequestDownload, isFalse);
      expect(
        CompanyVisibleWorkerDocument.fromJson(
          _document(type: 'cv'),
        ).canRequestDownload,
        isFalse,
      );
      expect(
        CompanyVisibleWorkerDocument.fromJson(
          _document(type: 'criminal_record'),
        ).canRequestDownload,
        isFalse,
      );
      final quarantined = WorkerDocument.fromJson({
        ..._document(),
        'status': 'quarantined',
        'scan_status': 'unscanned',
      });
      expect(quarantined.displayStatus, 'Yoxlanılır');
      for (final status in ['rejected', 'quarantined', 'deleted']) {
        final blocked = WorkerDocument.fromJson({
          ..._document(),
          'status': status,
        });
        expect(blocked.canRequestDownload, isFalse);
        expect(blocked.displayStatus, isNot(status));
      }
    },
  );
}

String _signedUrl(int index) =>
    'https://objects.example.test/private.pdf?X-Amz-Signature=test-$index';

Map<String, dynamic> _document({
  String type = 'cv',
  String name = 'old.pdf',
  bool legacy = false,
}) => {
  'type': type,
  'name': name,
  'available': true,
  'status': legacy ? 'legacy' : 'ready',
  'scan_status': legacy ? 'unscanned' : 'clean',
  if (legacy) 'url': 'https://raw-r2.example.test/bucket/private-old.pdf',
};

Map<String, dynamic> _profile({
  String type = 'cv',
  String name = 'old.pdf',
  bool legacy = false,
}) => {
  'id': 'worker-1',
  'name': 'Rəna Əliyeva',
  'status': 'approved',
  'documents': [_document(type: type, name: name, legacy: legacy)],
};

void _mockLauncher(List<String> launched) {
  const channel = MethodChannel('plugins.flutter.io/url_launcher');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (call) async {
        expect(call.method, 'launch');
        launched.add((call.arguments as Map)['url'] as String);
        return true;
      });
  addTearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null),
  );
}

class _Fixture {
  _Fixture(
    Future<ResponseBody> Function(RequestOptions) handler, {
    String role = 'worker',
  }) {
    final coordinator = SessionCoordinator();
    addTearDown(coordinator.dispose);
    final storage = _MemoryStorage(role);
    final dio = Dio(BaseOptions(baseUrl: 'https://api.example.test/v1'));
    dio.httpClientAdapter = _Adapter(handler);
    final client = ApiClient(
      baseUrl: dio.options.baseUrl,
      tokenStorage: storage,
      expectedRole: role,
      sessionCoordinator: coordinator,
      dioOverride: dio,
    );
    worker = WorkerRepository(apiClient: client);
    company = CompanyRepository(apiClient: client, tokenStorage: storage);
  }
  late final WorkerRepository worker;
  late final CompanyRepository company;

  Widget enrollmentApp() => Provider<WorkerRepository>.value(
    value: worker,
    child: MaterialApp(
      theme: AppTheme.light(),
      home: const Scaffold(
        body: SingleChildScrollView(
          padding: EdgeInsets.all(20),
          child: EnrollmentDocumentsSection(token: 'enrollment-only'),
        ),
      ),
    ),
  );
}

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions) handler;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => handler(options);
  @override
  void close({bool force = false}) {}
}

ResponseBody _response(int status, Map<String, dynamic> data) =>
    ResponseBody.fromString(
      jsonEncode(data),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );

class _MemoryStorage implements TokenStorage {
  _MemoryStorage(this.role);
  final String role;
  @override
  bool get isLoaded => true;
  @override
  String? get cachedAccessToken {
    String encode(Map<String, dynamic> value) =>
        base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
    return '${encode({'alg': 'HS256'})}.${encode({'sub': 'user-1', 'role': role, 'exp': 4102444800})}.test-only';
  }

  @override
  String? get cachedRefreshToken => null;
  @override
  Future<void> clear() async {}
  @override
  Future<void> warmUp() async {}
  @override
  Future<String?> readAccessToken() async => cachedAccessToken;
  @override
  Future<String?> readRefreshToken() async => null;
  @override
  Future<StoredTokens?> readTokens() async => null;
  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {}
}
