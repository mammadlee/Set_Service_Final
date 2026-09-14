import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/features/auth/data/models/auth_models.dart';
import 'package:worker_app/features/dashboard/presentation/screens/worker_dashboard_screen.dart';
import 'package:worker_app/features/worker/presentation/screens/worker_profile_screen.dart';
import 'package:worker_app/shared/widgets/premium_components.dart';
import 'package:worker_app/shared/widgets/worker_avatar.dart';

void main() {
  test('public worker media URLs resolve without duplicating the API path', () {
    expect(
      resolvePublicAssetUrl(
        '/uploads/workers/photo.jpg',
        baseUrl: 'https://api.example.test/v1',
      ),
      'https://api.example.test/uploads/workers/photo.jpg',
    );
    expect(
      resolvePublicAssetUrl(
        'uploads/workers/photo.jpg',
        baseUrl: 'https://api.example.test/v1',
      ),
      'https://api.example.test/v1/uploads/workers/photo.jpg',
    );
  });

  test(
    'an uploaded photo is confirmed only when the public image loads',
    () async {
      var attemptedUrl = '';
      final unavailable = await firstLoadablePublicAssetUrl(
        '/uploads/workers/photo.jpg',
        baseUrl: 'https://api.example.test/v1',
        load: (url) async {
          attemptedUrl = url;
          return false;
        },
      );

      expect(
        attemptedUrl,
        'https://api.example.test/uploads/workers/photo.jpg',
      );
      expect(unavailable, isNull);

      final available = await firstLoadablePublicAssetUrl(
        'https://media.example.test/photo.jpg',
        load: (_) async => true,
      );
      expect(available, 'https://media.example.test/photo.jpg');
    },
  );

  test('worker document parsing preserves backend security metadata', () {
    final worker = WorkerMe.fromJson({
      ..._workerJson(),
      'documents': [
        {
          'type': 'health_certificate',
          'name': 'arayis.pdf',
          'mime_type': 'application/pdf',
          'size_bytes': 248000,
          'uploaded_at': '2026-09-14T08:30:00.000Z',
          'company_visible': true,
          'status': 'ready',
          'scan_status': 'clean',
          'available': true,
          'download_url':
              '/v1/workers/worker-1/documents/health_certificate/download',
        },
        {
          'type': 'criminal_record',
          'name': 'legacy.pdf',
          'status': 'legacy',
          'scan_status': 'unscanned',
          'available': false,
        },
      ],
    });

    expect(worker.documents, hasLength(2));
    expect(worker.documents.first.sizeBytes, 248000);
    expect(worker.documents.first.status, 'ready');
    expect(worker.documents.first.scanStatus, 'clean');
    expect(worker.documents.first.available, isTrue);
    expect(
      worker.documents.first.effectiveDownloadPath,
      '/v1/workers/worker-1/documents/health_certificate/download',
    );
    expect(worker.documents.last.status, 'legacy');
    expect(worker.documents.last.effectiveDownloadPath, isNull);
  });

  testWidgets('avatar follows worker photo changes and has safe fallbacks', (
    tester,
  ) async {
    await tester.pumpWidget(
      _testApp(
        const WorkerAvatar(name: 'Rəna Əliyeva', photoUrl: null, radius: 36),
      ),
    );

    expect(find.text('RƏ'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(
      _testApp(
        const WorkerAvatar(
          name: 'Rəna Əliyeva',
          photoUrl: 'ftp://invalid.example/avatar.png',
          radius: 36,
        ),
      ),
    );
    await tester.pump();

    expect(find.text('RƏ'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(
      _testApp(
        const WorkerAvatar(
          name: 'Rəna Əliyeva',
          photoUrl: 'https://example.test/avatar-v2.png',
          radius: 36,
        ),
      ),
    );
    await tester.pump();

    expect(
      find.byKey(
        const ValueKey('worker-avatar-https://example.test/avatar-v2.png-0'),
      ),
      findsOneWidget,
    );

    await tester.pumpWidget(
      _testApp(
        const WorkerAvatar(
          name: 'Rəna Əliyeva',
          photoUrl: 'https://example.test/avatar-v2.png',
          cacheRevision: 1,
          radius: 36,
        ),
      ),
    );
    await tester.pump();

    expect(
      find.byKey(
        const ValueKey('worker-avatar-https://example.test/avatar-v2.png-1'),
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('documents section shows clear empty and uploaded states', (
    tester,
  ) async {
    await tester.pumpWidget(
      _testApp(
        WorkerDocumentsSection(
          worker: _worker(),
          uploading: false,
          uploadProgress: null,
          errorMessage: null,
          successMessage: null,
          onUploadHealthCertificate: _noopAsync,
          onUploadCriminalRecord: _noopAsync,
          onOpenDocument: (_) async {},
        ),
      ),
    );
    expect(
      find.byKey(const ValueKey('worker-documents-empty')),
      findsOneWidget,
    );
    expect(find.text('Hələ sənəd yüklənməyib.'), findsOneWidget);

    final uploaded = _worker(
      documents: const [
        WorkerDocument(
          type: 'health_certificate',
          name: 'Saglamliq arayisi 2026.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 248000,
          uploadedAt: '2026-09-14T08:30:00.000Z',
          companyVisible: true,
          status: 'ready',
          scanStatus: 'clean',
          available: true,
          downloadUrl:
              '/v1/workers/worker-1/documents/health_certificate/download',
        ),
      ],
    );
    await tester.pumpWidget(
      _testApp(
        WorkerDocumentsSection(
          worker: uploaded,
          uploading: false,
          uploadProgress: null,
          errorMessage: null,
          successMessage: 'Saglamliq arayisi 2026.pdf uğurla yükləndi.',
          onUploadHealthCertificate: _noopAsync,
          onUploadCriminalRecord: _noopAsync,
          onOpenDocument: (_) async {},
        ),
      ),
    );

    expect(
      find.byKey(const ValueKey('worker-document-health_certificate')),
      findsOneWidget,
    );
    expect(find.text('Saglamliq arayisi 2026.pdf'), findsOneWidget);
    expect(find.text('Yüklənib'), findsOneWidget);
    expect(find.text('242.2 KB'), findsOneWidget);
    expect(find.text('Müəssisəyə görünür'), findsOneWidget);
    expect(find.text('Açmaq üçün toxunun'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('selectable skill chip keeps geometry and wraps when narrow', (
    tester,
  ) async {
    var selected = false;
    await tester.pumpWidget(
      _testApp(
        SizedBox(
          width: 220,
          child: StatefulBuilder(
            builder: (context, setState) => Wrap(
              children: [
                PremiumSelectableChip(
                  key: const ValueKey('skill-chip'),
                  label: 'Təhlükəsizlik və gigiyena standartları (HACCP, ISO)',
                  selected: selected,
                  onSelected: (value) => setState(() => selected = value),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    final before = tester.getSize(find.byKey(const ValueKey('skill-chip')));

    await tester.tap(find.byKey(const ValueKey('skill-chip')));
    await tester.pumpAndSettle();
    final after = tester.getSize(find.byKey(const ValueKey('skill-chip')));

    expect(selected, isTrue);
    expect(after, before);
    expect(after.width, lessThanOrEqualTo(220));
    expect(tester.takeException(), isNull);
  });

  testWidgets('skill chip borders never overlap across phone widths', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    for (final testCase in const [
      (width: 320.0, scale: 1.5),
      (width: 360.0, scale: 1.3),
      (width: 390.0, scale: 1.0),
      (width: 430.0, scale: 1.0),
    ]) {
      tester.view.physicalSize = Size(testCase.width, 800);
      await tester.pumpWidget(
        _testApp(
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              PremiumSelectableChip(
                key: const ValueKey('skill-a'),
                label: 'Qonaqlarla peşəkar ünsiyyət',
                selected: false,
                onSelected: (_) {},
              ),
              PremiumSelectableChip(
                key: const ValueKey('skill-b'),
                label: 'Təhlükəsizlik və gigiyena standartları (HACCP, ISO)',
                selected: true,
                onSelected: (_) {},
              ),
              PremiumSelectableChip(
                key: const ValueKey('skill-c'),
                label: 'Komanda ilə işləmək bacarığı',
                selected: false,
                onSelected: (_) {},
              ),
            ],
          ),
          textScaler: TextScaler.linear(testCase.scale),
        ),
      );
      await tester.pumpAndSettle();

      final rects = [
        tester.getRect(find.byKey(const ValueKey('skill-a'))),
        tester.getRect(find.byKey(const ValueKey('skill-b'))),
        tester.getRect(find.byKey(const ValueKey('skill-c'))),
      ];
      for (var left = 0; left < rects.length; left += 1) {
        expect(rects[left].width, lessThanOrEqualTo(testCase.width - 32));
        for (var right = left + 1; right < rects.length; right += 1) {
          expect(
            rects[left].overlaps(rects[right]),
            isFalse,
            reason: '${testCase.width}px at ${testCase.scale}x text',
          );
        }
      }
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('dashboard and identity stay responsive on narrow phones', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    for (final size in const [
      Size(320, 480),
      Size(360, 640),
      Size(390, 844),
      Size(430, 932),
    ]) {
      tester.view.physicalSize = size;
      await tester.pumpWidget(
        _testApp(
          WorkerDashboardContent(
            worker: _worker(
              name: 'Çox Uzun Azərbaycanlı İşçi Adı Soyadı Nümunəsi',
              position:
                  'Baş qonaq münasibətləri və əməliyyat koordinasiya mütəxəssisi',
              positions: const [
                'Baş qonaq münasibətləri və əməliyyat koordinasiya mütəxəssisi',
              ],
            ),
            assignments: const [],
            onRefresh: _noopAsync,
          ),
          scrollable: false,
          textScaler: size.width == 320
              ? const TextScaler.linear(1.35)
              : TextScaler.noScaling,
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('worker-dashboard-identity')),
        findsOneWidget,
        reason: '$size',
      );
      expect(tester.takeException(), isNull, reason: '$size');
    }
  });
}

Widget _testApp(
  Widget child, {
  bool scrollable = true,
  TextScaler textScaler = TextScaler.noScaling,
}) {
  return MaterialApp(
    theme: AppTheme.light(),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: textScaler),
      child: child!,
    ),
    home: Scaffold(
      body: SafeArea(
        child: scrollable
            ? SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: child,
              )
            : Padding(padding: const EdgeInsets.all(16), child: child),
      ),
    ),
  );
}

Future<void> _noopAsync() async {}

WorkerMe _worker({
  String name = 'Rəna Əliyeva',
  String? position = 'Ofisiant',
  List<String> positions = const ['Ofisiant'],
  List<WorkerDocument> documents = const [],
}) {
  return WorkerMe(
    id: 'worker-1',
    name: name,
    phone: '+994501112233',
    position: position,
    positionIds: const ['position-1'],
    positions: positions,
    departments: const ['Qida və içki'],
    subdepartments: const ['Restoran xidməti'],
    email: 'rena@example.test',
    emailVerified: true,
    emailVerifiedAt: '2026-09-14T08:00:00.000Z',
    pendingEmail: null,
    profilePhotoUrl: null,
    skills: const ['Komanda işi'],
    languages: const ['Azərbaycan dili'],
    documents: documents,
    workHistorySummary: null,
    workHistory: const [],
    gender: 'female',
    whatsappAvailable: true,
    status: 'approved',
    availability: true,
    workerClass: 'A',
    ratingAverage: 4.8,
    ratingCount: 16,
  );
}

Map<String, dynamic> _workerJson() {
  return {
    'id': 'worker-1',
    'name': 'Rəna Əliyeva',
    'phone': '+994501112233',
    'position': 'Ofisiant',
    'position_ids': ['position-1'],
    'positions': [
      {
        'id': 'position-1',
        'name_az': 'Ofisiant',
        'department': {'name_az': 'Qida və içki'},
        'subdepartment': {'name_az': 'Restoran xidməti'},
      },
    ],
    'email_verified': true,
    'skills': ['Komanda işi'],
    'languages': ['Azərbaycan dili'],
    'work_history': <Object>[],
    'whatsapp_available': true,
    'status': 'approved',
    'availability': true,
    'worker_class': 'A',
    'rating_avg': 4.8,
    'rating_count': 16,
  };
}
