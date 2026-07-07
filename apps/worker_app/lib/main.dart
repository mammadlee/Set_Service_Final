import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/config/app_config.dart';
import 'core/network/api_client.dart';
import 'core/push/push_notification_service.dart';
import 'core/push/push_registration_service.dart';
import 'core/router/app_routes.dart';
import 'core/session/app_role.dart';
import 'core/session/role_session_controller.dart';
import 'core/storage/secure_token_storage.dart';
import 'core/storage/token_storage.dart';
import 'core/theme/app_theme.dart';
import 'features/admin/data/admin_repository.dart';
import 'features/admin/presentation/admin_auth_controller.dart';
import 'features/assignments/data/assignment_repository.dart';
import 'features/attendance/data/attendance_repository.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/presentation/controllers/auth_controller.dart';
import 'features/app_shell/presentation/multi_role_gate.dart';
import 'features/company/data/company_repository.dart';
import 'features/company/presentation/company_auth_controller.dart';
import 'features/notifications/data/notification_repository.dart';
import 'features/ratings/data/rating_repository.dart';
import 'features/taxonomy/data/taxonomy_repository.dart';
import 'features/worker/data/worker_repository.dart';
import 'shared/app_strings.dart';

final appNavigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final configIssue = AppConfig.configIssue;
  if (configIssue != null) {
    runApp(ConfigErrorApp(issue: configIssue));
    return;
  }

  final workerTokenStorage = SecureTokenStorage(namespace: AppRole.worker.name);
  final companyTokenStorage = SecureTokenStorage(
    namespace: AppRole.company.name,
  );
  final adminTokenStorage = SecureTokenStorage(namespace: AppRole.admin.name);
  final workerApiClient = ApiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenStorage: workerTokenStorage,
    expectedRole: AppRole.worker.apiRole,
  );
  final companyApiClient = ApiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenStorage: companyTokenStorage,
    expectedRole: AppRole.company.apiRole,
  );
  final adminApiClient = ApiClient(
    baseUrl: AppConfig.apiBaseUrl,
    tokenStorage: adminTokenStorage,
    expectedRole: AppRole.admin.apiRole,
  );
  final pushNotificationService = PushNotificationService();

  runApp(
    SetServiceApp(
      workerApiClient: workerApiClient,
      workerTokenStorage: workerTokenStorage,
      companyApiClient: companyApiClient,
      companyTokenStorage: companyTokenStorage,
      adminApiClient: adminApiClient,
      adminTokenStorage: adminTokenStorage,
      pushNotificationService: pushNotificationService,
    ),
  );

  if (AppConfig.pushNotificationsEnabled) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(
        Future<void>.delayed(const Duration(seconds: 2), () {
          return pushNotificationService.initialize(
            navigatorKey: appNavigatorKey,
          );
        }),
      );
    });
  }
}

class ConfigErrorApp extends StatelessWidget {
  const ConfigErrorApp({required this.issue, super.key});

  final AppConfigIssue issue;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppStrings.appTitle,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: _ConfigErrorScreen(issue: issue),
    );
  }
}

class _ConfigErrorScreen extends StatelessWidget {
  const _ConfigErrorScreen({required this.issue});

  final AppConfigIssue issue;

  @override
  Widget build(BuildContext context) {
    final message = switch (issue) {
      AppConfigIssue.missingBaseUrl => AppStrings.configErrorBaseUrlMissing,
      AppConfigIssue.localBaseUrl => AppStrings.configErrorBaseUrlLocal,
    };

    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.settings_outlined,
                  size: 52,
                  color: BrandColors.primaryBurgundy,
                ),
                const SizedBox(height: 16),
                Text(
                  AppStrings.configErrorTitle,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: BrandColors.mutedBrown,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SetServiceApp extends StatelessWidget {
  const SetServiceApp({
    required this.workerApiClient,
    required this.workerTokenStorage,
    required this.companyApiClient,
    required this.companyTokenStorage,
    required this.adminApiClient,
    required this.adminTokenStorage,
    required this.pushNotificationService,
    super.key,
  });

  final ApiClient workerApiClient;
  final TokenStorage workerTokenStorage;
  final ApiClient companyApiClient;
  final TokenStorage companyTokenStorage;
  final ApiClient adminApiClient;
  final TokenStorage adminTokenStorage;
  final PushNotificationService pushNotificationService;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: workerApiClient),
        Provider<TokenStorage>.value(value: workerTokenStorage),
        Provider<PushNotificationService>.value(value: pushNotificationService),
        ChangeNotifierProvider<RoleSessionController>(
          create: (_) => RoleSessionController()..bootstrap(),
        ),
        Provider<AuthRepository>(
          create: (_) => AuthRepository(
            apiClient: workerApiClient,
            tokenStorage: workerTokenStorage,
          ),
        ),
        Provider<CompanyRepository>(
          create: (_) => CompanyRepository(
            apiClient: companyApiClient,
            tokenStorage: companyTokenStorage,
          ),
        ),
        Provider<AdminRepository>(
          create: (_) => AdminRepository(
            apiClient: adminApiClient,
            tokenStorage: adminTokenStorage,
          ),
        ),
        Provider<AssignmentRepository>(
          create: (_) => AssignmentRepository(apiClient: workerApiClient),
        ),
        Provider<AttendanceRepository>(
          create: (_) => AttendanceRepository(apiClient: workerApiClient),
        ),
        Provider<WorkerRepository>(
          create: (_) => WorkerRepository(apiClient: workerApiClient),
        ),
        Provider<RatingRepository>(
          create: (_) => RatingRepository(apiClient: workerApiClient),
        ),
        Provider<NotificationRepository>(
          create: (_) => NotificationRepository(apiClient: workerApiClient),
        ),
        Provider<TaxonomyRepository>(
          create: (_) => TaxonomyRepository(apiClient: workerApiClient),
        ),
        ChangeNotifierProvider<AuthController>(
          create: (context) => AuthController(
            context.read<AuthRepository>(),
            PushRegistrationService(
              apiClient: workerApiClient,
              pushNotificationService: pushNotificationService,
            ),
          )..bootstrap(),
        ),
        ChangeNotifierProvider<CompanyAuthController>(
          create: (context) => CompanyAuthController(
            context.read<CompanyRepository>(),
            PushRegistrationService(
              apiClient: companyApiClient,
              pushNotificationService: pushNotificationService,
            ),
          )..bootstrap(),
        ),
        ChangeNotifierProvider<AdminAuthController>(
          create: (context) => AdminAuthController(
            context.read<AdminRepository>(),
            PushRegistrationService(
              apiClient: adminApiClient,
              pushNotificationService: pushNotificationService,
            ),
          )..bootstrap(),
        ),
      ],
      child: MaterialApp(
        title: AppStrings.appTitle,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        navigatorKey: appNavigatorKey,
        onGenerateRoute: AppRoutes.onGenerateRoute,
        home: const MultiRoleGate(),
      ),
    );
  }
}
