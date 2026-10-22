import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/features/assignments/data/models/assignment.dart';
import 'package:worker_app/features/assignments/presentation/widgets/assignment_card.dart';
import 'package:worker_app/features/auth/data/models/auth_models.dart';
import 'package:worker_app/features/dashboard/presentation/screens/worker_dashboard_screen.dart';
import 'package:worker_app/features/notifications/data/models/notification_item.dart';
import 'package:worker_app/features/notifications/presentation/widgets/notification_card.dart';
import 'package:worker_app/features/worker/presentation/screens/worker_profile_screen.dart';
import 'package:worker_app/shared/app_strings.dart';
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

  test('CV metadata is parsed independently without exposing storage keys', () {
    final worker = WorkerMe.fromJson({
      ..._workerJson(),
      'documents': [
        {
          'type': 'cv',
          'name': 'Rena-Aliyeva-CV.pdf',
          'key': 'workers/worker-1/documents/cv/private-object.pdf',
          'mime_type': 'application/pdf',
          'size_bytes': 512000,
          'uploaded_at': '2026-09-16T08:30:00.000Z',
          'company_visible': false,
          'status': 'ready',
          'scan_status': 'clean',
          'available': true,
          'download_url': '/v1/workers/worker-1/documents/cv/download',
        },
      ],
    });

    expect(worker.documents, hasLength(1));
    expect(worker.documents.single.type, 'cv');
    expect(worker.documents.single.name, 'Rena-Aliyeva-CV.pdf');
    expect(worker.documents.single.companyVisible, isFalse);
    expect(
      worker.documents.single.effectiveDownloadPath,
      '/v1/workers/worker-1/documents/cv/download',
    );
    expect(worker.toString(), isNot(contains('private-object.pdf')));
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

  testWidgets(
    'CV section is optional and exposes view replace delete actions',
    (tester) async {
      var uploads = 0;
      var opens = 0;
      var deletes = 0;

      await tester.pumpWidget(
        _testApp(
          WorkerCvSection(
            worker: _worker(),
            uploading: false,
            deleting: false,
            uploadProgress: null,
            errorMessage: null,
            successMessage: null,
            onUpload: () async => uploads += 1,
            onOpen: (_) async => opens += 1,
            onDelete: () async => deletes += 1,
          ),
        ),
      );

      expect(find.byKey(const ValueKey('worker-cv-empty')), findsOneWidget);
      expect(find.text('CV yüklənməyib.'), findsOneWidget);
      expect(
        find.text(
          'İş təcrübəniz və peşəkar məlumatlarınız olan CV faylını yükləyin.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('CV yüklə'));
      await tester.pump();
      expect(uploads, 1);

      final withCv = _worker(
        documents: const [
          WorkerDocument(
            type: 'cv',
            name: 'Rena-Aliyeva-CV.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 512000,
            uploadedAt: '2026-09-16T08:30:00.000Z',
            companyVisible: false,
            status: 'ready',
            scanStatus: 'clean',
            available: true,
            downloadUrl: '/v1/workers/worker-1/documents/cv/download',
          ),
        ],
      );
      await tester.pumpWidget(
        _testApp(
          WorkerCvSection(
            worker: withCv,
            uploading: false,
            deleting: false,
            uploadProgress: null,
            errorMessage: null,
            successMessage: null,
            onUpload: () async => uploads += 1,
            onOpen: (_) async => opens += 1,
            onDelete: () async => deletes += 1,
          ),
        ),
      );

      expect(find.byKey(const ValueKey('worker-cv-card')), findsOneWidget);
      expect(find.text('Rena-Aliyeva-CV.pdf'), findsOneWidget);
      expect(find.text('Yüklənib'), findsOneWidget);
      await tester.tap(find.text('Bax'));
      await tester.tap(find.text('Yenilə'));
      await tester.tap(find.text('Sil'));
      await tester.pump();
      expect(opens, 1);
      expect(uploads, 2);
      expect(deletes, 1);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('CV stays out of the existing arayis document list', (
    tester,
  ) async {
    await tester.pumpWidget(
      _testApp(
        WorkerDocumentsSection(
          worker: _worker(
            documents: const [
              WorkerDocument(
                type: 'cv',
                name: 'Rena-Aliyeva-CV.pdf',
                status: 'ready',
                scanStatus: 'clean',
                available: true,
              ),
            ],
          ),
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
    expect(find.byKey(const ValueKey('worker-document-cv')), findsNothing);
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

  testWidgets('premium card clips the surface, not its padded text content', (
    tester,
  ) async {
    const cardKey = ValueKey('premium-card-clip-regression');
    const textKey = ValueKey('premium-card-clip-regression-text');

    await tester.pumpWidget(
      _testApp(
        const Premium3DCard(
          key: cardKey,
          padding: EdgeInsets.all(24),
          child: Text('Tədbir və qonaqpərvərlik əməliyyatları', key: textKey),
        ),
      ),
    );
    await tester.pump();

    final card = find.byKey(cardKey);
    final container = find.descendant(
      of: card,
      matching: find.byType(AnimatedContainer),
    );
    final surface = find.descendant(of: card, matching: find.byType(Material));
    expect(container, findsOneWidget);
    expect(surface, findsOneWidget);

    final cardRect = tester.getRect(container);
    final surfaceRect = tester.getRect(surface);
    final textRect = tester.getRect(find.byKey(textKey));
    expect(cardRect.contains(surfaceRect.topLeft), isTrue);
    expect(cardRect.contains(surfaceRect.bottomRight), isTrue);
    expect(surfaceRect.left - cardRect.left, lessThanOrEqualTo(1.1));
    expect(surfaceRect.top - cardRect.top, lessThanOrEqualTo(1.1));
    expect(textRect.left, greaterThanOrEqualTo(surfaceRect.left + 23));
    expect(textRect.top, greaterThanOrEqualTo(surfaceRect.top + 23));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'worker dashboard keeps stats and complete next-job text across devices',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);

      final assignment = _assignment(status: 'assigned');
      for (final testCase in const [
        (size: Size(320, 568), scale: 1.3),
        (size: Size(390, 844), scale: 1.0),
        (size: Size(768, 1024), scale: 1.0),
        (size: Size(1024, 768), scale: 1.0),
        (size: Size(844, 390), scale: 1.0),
      ]) {
        tester.view.physicalSize = testCase.size;
        await tester.pumpWidget(
          _testApp(
            WorkerDashboardContent(
              worker: _worker(
                name: _longWorkerName,
                position: _longRole,
                positions: const [_longRole],
              ),
              assignments: [assignment],
              onRefresh: _noopAsync,
            ),
            scrollable: false,
            textScaler: TextScaler.linear(testCase.scale),
          ),
        );
        await tester.pump(const Duration(milliseconds: 900));

        await tester.scrollUntilVisible(
          find.text('Yeni işlər'),
          160,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();

        expect(find.text('Yeni işlər'), findsOneWidget);
        expect(find.text('Qəbul edilən'), findsOneWidget);
        expect(find.text('Tamamlanmış işlər'), findsOneWidget);

        for (final label in const [
          'Yeni işlər',
          'Qəbul edilən',
          'Tamamlanmış işlər',
        ]) {
          final text = tester.widget<Text>(find.text(label));
          expect(text.maxLines, isNull, reason: '$label ${testCase.size}');
          expect(text.overflow, isNull, reason: '$label ${testCase.size}');
        }

        await tester.scrollUntilVisible(
          find.text(_longOrderTitle),
          160,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(find.text(_longOrderTitle), findsOneWidget);
        expect(find.text(_longRole), findsWidgets);
        expect(find.text(_longCompany), findsOneWidget);
        expect(find.text(_longLocation), findsOneWidget);

        expect(tester.takeException(), isNull, reason: '${testCase.size}');
      }
    },
  );

  testWidgets(
    'assignment and notification cards keep long Azerbaijani text complete',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);

      const notificationTitle = 'Yeni tədbir təyinatı və giriş-çıxış məlumatı';
      const notificationBody =
          'Qonaqpərvərlik tədbiri üzrə qəbul etdiyiniz işin bütün məlumatlarını yoxlayın və vaxtında məkanda olun.';

      for (final testCase in const [
        (size: Size(320, 568), scale: 1.3),
        (size: Size(390, 844), scale: 1.0),
        (size: Size(768, 1024), scale: 1.0),
        (size: Size(1024, 768), scale: 1.0),
        (size: Size(844, 390), scale: 1.0),
      ]) {
        tester.view.physicalSize = testCase.size;
        await tester.pumpWidget(
          _testApp(
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final status in const [
                  'assigned',
                  'accepted',
                  'completed',
                ]) ...[
                  AssignmentCard(
                    assignment: _assignment(status: status, id: status),
                    onTap: () {},
                  ),
                  const SizedBox(height: 12),
                ],
                NotificationCard(
                  notification: NotificationItem(
                    id: 'notification-1',
                    type: 'job_assigned',
                    channel: 'in_app',
                    title: notificationTitle,
                    body: notificationBody,
                    metadata: const {},
                    readAt: DateTime(2026, 10, 7),
                    createdAt: DateTime(2026, 10, 7, 10, 30),
                  ),
                  title: notificationTitle,
                  body: notificationBody,
                  onTap: () {},
                ),
              ],
            ),
            textScaler: TextScaler.linear(testCase.scale),
          ),
        );
        await tester.pump(const Duration(milliseconds: 450));

        expect(find.text(_longOrderTitle), findsNWidgets(3));
        expect(find.text(_longRole), findsNWidgets(3));
        expect(find.text(_longCompany), findsNWidgets(3));
        expect(find.text(_longLocation), findsNWidgets(3));
        expect(find.text(notificationTitle), findsOneWidget);
        expect(find.text(notificationBody), findsOneWidget);
        expect(find.text(AppStrings.statusLabel('accepted')), findsOneWidget);
        expect(find.text(AppStrings.statusLabel('completed')), findsOneWidget);

        for (final value in const [
          _longOrderTitle,
          _longRole,
          _longCompany,
          _longLocation,
          notificationTitle,
          notificationBody,
        ]) {
          for (final element in find.text(value).evaluate()) {
            final text = element.widget as Text;
            expect(text.overflow, isNull, reason: '$value ${testCase.size}');
          }
        }
        expect(tester.takeException(), isNull, reason: '${testCase.size}');
      }
    },
  );
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

const _longWorkerName = 'Ülviyyə Məmmədova Əli qızı';
const _longOrderTitle =
    'Tədbir — Beynəlxalq qonaqpərvərlik və Azərbaycan mətbəxi təqdimatı';
const _longRole =
    'Baş qonaq münasibətləri və çoxşaxəli banket əməliyyatları koordinatoru';
const _longCompany =
    'Azərbaycan Qonaqpərvərlik və Tədbirlərin İdarə Edilməsi Mərkəzi';
const _longLocation =
    'Bakı şəhəri, Səbail rayonu, Neftçilər prospekti, əsas tədbir zalı';

Assignment _assignment({required String status, String id = 'assignment-1'}) {
  return Assignment(
    id: id,
    orderId: 'order-1',
    workerId: 'worker-1',
    category: _longRole,
    status: status,
    assignedAt: DateTime(2026, 10, 7, 9),
    updatedAt: DateTime(2026, 10, 7, 9),
    order: AssignmentOrder(
      id: 'order-1',
      title: _longOrderTitle,
      category: _longRole,
      status: status == 'completed' ? 'completed' : 'published',
      requiredCount: 4,
      startDatetime: DateTime(2026, 10, 8, 18, 30),
      endDatetime: DateTime(2026, 10, 8, 23, 30),
      location: _longLocation,
      company: const AssignmentCompany(
        id: 'company-1',
        name: _longCompany,
        status: 'approved',
        phone: '+994702315151',
      ),
    ),
    worker: const AssignmentWorker(
      id: 'worker-1',
      name: _longWorkerName,
      phone: '+994501112233',
      status: 'approved',
      availability: true,
      position: _longRole,
    ),
  );
}

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
