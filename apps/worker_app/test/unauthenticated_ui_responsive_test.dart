import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worker_app/core/network/api_client.dart';
import 'package:worker_app/core/push/push_notification_service.dart';
import 'package:worker_app/core/push/push_registration_service.dart';
import 'package:worker_app/core/session/role_session_controller.dart';
import 'package:worker_app/core/session/session_coordinator.dart';
import 'package:worker_app/core/storage/token_storage.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/features/admin/data/admin_repository.dart';
import 'package:worker_app/features/admin/presentation/admin_auth_controller.dart';
import 'package:worker_app/features/admin/presentation/admin_login_screen.dart';
import 'package:worker_app/features/auth/data/auth_repository.dart';
import 'package:worker_app/features/auth/presentation/controllers/auth_controller.dart';
import 'package:worker_app/features/auth/presentation/screens/account_blocked_screen.dart';
import 'package:worker_app/features/auth/presentation/screens/login_screen.dart';
import 'package:worker_app/features/auth/presentation/screens/otp_screen.dart';
import 'package:worker_app/features/auth/presentation/screens/password_screen.dart';
import 'package:worker_app/features/auth/presentation/screens/pending_approval_screen.dart';
import 'package:worker_app/features/auth/presentation/screens/register_screen.dart';
import 'package:worker_app/features/company/data/company_repository.dart';
import 'package:worker_app/features/company/presentation/company_auth_controller.dart';
import 'package:worker_app/features/company/presentation/company_login_screen.dart';
import 'package:worker_app/features/company/presentation/company_otp_screen.dart';
import 'package:worker_app/features/company/presentation/company_password_screen.dart';
import 'package:worker_app/features/company/presentation/company_status_screen.dart';
import 'package:worker_app/features/taxonomy/data/taxonomy_repository.dart';
import 'package:worker_app/shared/app_strings.dart';
import 'package:worker_app/shared/widgets/premium_components.dart';

void main() {
  const compactPhoneSizes = <Size>[
    Size(320, 480),
    Size(360, 640),
    Size(390, 844),
    Size(430, 932),
  ];

  testWidgets('all unauthenticated forms remain usable on common phone sizes', (
    tester,
  ) async {
    final fixture = _UiFixture();
    addTearDown(fixture.dispose);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final screens = <String, Widget Function()>{
      'worker login': () => const LoginScreen(),
      'worker registration': () => const RegisterScreen(),
      'worker otp': () => const OtpScreen(),
      'worker password': () => const PasswordScreen(),
      'worker pending': () => const PendingApprovalScreen(),
      'worker blocked': () => const AccountBlockedScreen(),
      'company login': () => const CompanyLoginScreen(),
      'company registration': () => const CompanyRegisterScreen(),
      'company otp': () => const CompanyOtpScreen(),
      'company password': () => const CompanyPasswordScreen(),
      'company pending': () => const CompanyStatusScreen(
        title: AppStrings.pendingApprovalTitle,
        body: AppStrings.companyPendingApprovalMessage,
        icon: Icons.hourglass_top_outlined,
        color: BrandColors.accentGold,
      ),
      'admin login': () => const AdminLoginScreen(),
    };

    for (final entry in screens.entries) {
      for (final phoneSize in compactPhoneSizes) {
        tester.view.physicalSize = phoneSize;
        await tester.pumpWidget(fixture.wrap(entry.value()));
        await tester.pumpAndSettle();

        expect(
          tester.takeException(),
          isNull,
          reason: '${entry.key} $phoneSize',
        );

        final scrollables = find.byType(Scrollable);
        expect(scrollables, findsWidgets, reason: '${entry.key} $phoneSize');
        final position = tester
            .state<ScrollableState>(scrollables.first)
            .position;
        position.jumpTo(position.maxScrollExtent);
        await tester.pump();

        expect(
          tester.takeException(),
          isNull,
          reason: '${entry.key} $phoneSize',
        );
      }
    }
  });

  testWidgets('worker registration preserves the complete field hierarchy', (
    tester,
  ) async {
    final fixture = _UiFixture();
    addTearDown(fixture.dispose);
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(fixture.wrap(const RegisterScreen()));
    await tester.pumpAndSettle();

    expect(find.text(AppStrings.fullName), findsOneWidget);
    expect(find.text(AppStrings.phoneNumber), findsOneWidget);
    expect(find.text('Şöbə seçin'), findsOneWidget);
    _expectRegistrationSelectorBorder(tester, 'Şöbə');

    await tester.tap(find.text('Şöbə seçin'));
    await tester.pumpAndSettle();
    expect(find.text('Mətbəx Şöbəsi'), findsOneWidget);
    await tester.tap(find.text('Mətbəx Şöbəsi'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -220));
    await tester.pumpAndSettle();

    expect(find.text('Departament seçin'), findsOneWidget);
    _expectRegistrationSelectorBorder(tester, 'Departament');
    await tester.tap(find.text('Departament seçin'));
    await tester.pumpAndSettle();
    expect(find.text('İsti mətbəx'), findsOneWidget);
    await tester.tap(find.text('İsti mətbəx'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -180));
    await tester.pumpAndSettle();

    expect(find.text('Vəzifə seçin'), findsOneWidget);
    _expectRegistrationSelectorBorder(tester, 'Vəzifə');
    await tester.tap(find.text('Vəzifə seçin'));
    await tester.pumpAndSettle();
    expect(find.text('Aşpaz'), findsOneWidget);
    await tester.tap(find.text('Aşpaz'));
    await tester.pumpAndSettle();
    expect(find.text('Aşpaz'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text(AppStrings.registerAndSendOtp),
      240,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(find.text(AppStrings.skills), findsOneWidget);
    expect(find.text(AppStrings.languages), findsOneWidget);
    expect(find.text(AppStrings.registerAndSendOtp), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('skills sheet stays usable with keyboard on a narrow phone', (
    tester,
  ) async {
    final fixture = _UiFixture();
    addTearDown(fixture.dispose);
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);

    await tester.pumpWidget(fixture.wrap(const RegisterScreen()));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text(AppStrings.skillsHint));
    await tester.pumpAndSettle();
    await tester.tap(find.text(AppStrings.skillsHint));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Vaxtın idarə olunması'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Vaxtın idarə olunması'));
    await tester.pumpAndSettle();
    final selectedChip = tester.widget<PremiumSelectableChip>(
      find.ancestor(
        of: find.text('Vaxtın idarə olunması'),
        matching: find.byType(PremiumSelectableChip),
      ),
    );
    expect(selectedChip.selected, isTrue);

    tester.view.viewInsets = const FakeViewPadding(bottom: 240);
    await tester.showKeyboard(find.byType(TextField).last);
    await tester.pumpAndSettle();

    expect(find.text(AppStrings.cancel), findsOneWidget);
    expect(find.text(AppStrings.save), findsOneWidget);
    expect(
      tester
          .widget<PremiumSelectableChip>(
            find.ancestor(
              of: find.text('Vaxtın idarə olunması'),
              matching: find.byType(PremiumSelectableChip),
            ),
          )
          .selected,
      isTrue,
    );
    expect(tester.takeException(), isNull);
  });
}

void _expectRegistrationSelectorBorder(WidgetTester tester, String label) {
  final selector = tester.widget<AnimatedContainer>(
    find.byKey(ValueKey('registration-selector-$label')),
  );
  final decoration = selector.decoration! as BoxDecoration;
  expect(decoration.borderRadius, const BorderRadius.all(Radius.circular(14)));
  final border = decoration.border! as Border;
  expect(border.top.width, 1.25);
  expect(border.right.width, 1.25);
  expect(border.bottom.width, 1.25);
  expect(border.left.width, 1.25);
}

class _UiFixture {
  _UiFixture() {
    workerClient = _client('worker');
    companyClient = _client('company');
    adminClient = _client('super_admin');
    final push = PushNotificationService();

    workerAuth = AuthController(
      AuthRepository(apiClient: workerClient, tokenStorage: workerStorage),
      PushRegistrationService(
        apiClient: workerClient,
        pushNotificationService: push,
      ),
      coordinator,
    );
    companyAuth = CompanyAuthController(
      CompanyRepository(apiClient: companyClient, tokenStorage: companyStorage),
      PushRegistrationService(
        apiClient: companyClient,
        pushNotificationService: push,
      ),
      coordinator,
    );
    adminAuth = AdminAuthController(
      AdminRepository(apiClient: adminClient, tokenStorage: adminStorage),
      PushRegistrationService(
        apiClient: adminClient,
        pushNotificationService: push,
      ),
      coordinator,
    );
  }

  final coordinator = SessionCoordinator();
  final roleSession = RoleSessionController();
  final workerStorage = _MemoryTokenStorage();
  final companyStorage = _MemoryTokenStorage();
  final adminStorage = _MemoryTokenStorage();
  late final ApiClient workerClient;
  late final ApiClient companyClient;
  late final ApiClient adminClient;
  late final AuthController workerAuth;
  late final CompanyAuthController companyAuth;
  late final AdminAuthController adminAuth;

  Widget wrap(Widget child) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<RoleSessionController>.value(value: roleSession),
        ChangeNotifierProvider<AuthController>.value(value: workerAuth),
        ChangeNotifierProvider<CompanyAuthController>.value(value: companyAuth),
        ChangeNotifierProvider<AdminAuthController>.value(value: adminAuth),
        Provider<TaxonomyRepository>.value(
          value: TaxonomyRepository(apiClient: workerClient),
        ),
      ],
      child: MaterialApp(theme: AppTheme.light(), home: child),
    );
  }

  ApiClient _client(String role) {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = _CallbackAdapter((options) async {
      if (options.path == '/taxonomy') {
        return _jsonResponse(200, _taxonomyResponse);
      }
      return _jsonResponse(200, <String, dynamic>{});
    });
    return ApiClient(
      baseUrl: 'https://example.test',
      tokenStorage: switch (role) {
        'worker' => workerStorage,
        'company' => companyStorage,
        _ => adminStorage,
      },
      expectedRole: role,
      sessionCoordinator: coordinator,
      dioOverride: dio,
      refreshDioOverride: Dio(BaseOptions(baseUrl: 'https://example.test')),
    );
  }

  Future<void> dispose() async {
    workerAuth.dispose();
    companyAuth.dispose();
    adminAuth.dispose();
    roleSession.dispose();
    await coordinator.dispose();
  }
}

class _MemoryTokenStorage implements TokenStorage {
  @override
  bool get isLoaded => true;

  @override
  String? get cachedAccessToken => null;

  @override
  String? get cachedRefreshToken => null;

  @override
  Future<void> clear() async {}

  @override
  Future<String?> readAccessToken() async => null;

  @override
  Future<String?> readRefreshToken() async => null;

  @override
  Future<StoredTokens?> readTokens() async => null;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {}

  @override
  Future<void> warmUp() async {}
}

class _CallbackAdapter implements HttpClientAdapter {
  _CallbackAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonResponse(int statusCode, Map<String, dynamic> body) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );
}

const _taxonomyResponse = <String, dynamic>{
  'data': [
    {
      'id': 'department-1',
      'name_az': 'Mətbəx Şöbəsi',
      'subdepartments': [
        {
          'id': 'subdepartment-1',
          'department_id': 'department-1',
          'name_az': 'İsti mətbəx',
          'positions': [
            {
              'id': 'position-1',
              'subdepartment_id': 'subdepartment-1',
              'name_az': 'Aşpaz',
            },
          ],
        },
      ],
    },
  ],
};
