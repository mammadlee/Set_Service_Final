import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../router/app_routes.dart';
import '../session/app_role.dart';
import '../session/role_session_controller.dart';
import '../../shared/app_strings.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Local builds may not include Firebase config files yet.
  }
}

class PushNotificationService {
  PushNotificationService();

  FirebaseMessaging? _messaging;
  bool _initialized = false;
  bool _available = false;
  GlobalKey<NavigatorState>? _navigatorKey;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _tapSubscription;

  Stream<String> get onTokenRefresh =>
      _messaging?.onTokenRefresh ?? const Stream<String>.empty();

  Future<void> initialize({
    required GlobalKey<NavigatorState> navigatorKey,
  }) async {
    if (_initialized) return;
    _initialized = true;
    _navigatorKey = navigatorKey;

    try {
      await Firebase.initializeApp();
      _messaging = FirebaseMessaging.instance;
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      _available = true;
    } catch (_) {
      _available = false;
      debugPrint(AppStrings.firebaseNotConfigured);
      return;
    }

    _foregroundSubscription = FirebaseMessaging.onMessage.listen(
      _showForegroundNotification,
    );
    _tapSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
      _handleNotificationTap,
    );

    final initialMessage = await _messaging?.getInitialMessage();
    if (initialMessage != null) {
      scheduleMicrotask(() => _handleNotificationTap(initialMessage));
    }
  }

  Future<String?> getToken() async {
    if (!_available) return null;
    final messaging = _messaging;
    if (messaging == null) return null;
    final settings = await messaging.requestPermission();
    final allowed =
        settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
    if (!allowed) return null;
    return messaging.getToken();
  }

  Future<String?> currentToken() async {
    if (!_available) return null;
    final messaging = _messaging;
    if (messaging == null) return null;
    try {
      return await messaging.getToken();
    } catch (_) {
      return null;
    }
  }

  Future<void> deleteLocalToken() async {
    if (!_available) return;
    final messaging = _messaging;
    if (messaging == null) return;
    try {
      await messaging.deleteToken();
    } catch (_) {
      // Server-side logout must continue even if Firebase local cleanup fails.
    }
  }

  Future<void> dispose() async {
    await _foregroundSubscription?.cancel();
    await _tapSubscription?.cancel();
  }

  void _showForegroundNotification(RemoteMessage message) {
    final context = _navigatorKey?.currentContext;
    if (context == null) return;

    final title = _safeText(
      message.notification?.title,
      AppStrings.notifications,
    );
    final body = _safeText(
      message.notification?.body,
      AppStrings.newNotification,
    );

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(body, maxLines: 2, overflow: TextOverflow.ellipsis),
          ],
        ),
        action: SnackBarAction(
          label: AppStrings.open,
          onPressed: () => _handleNotificationTap(message),
        ),
      ),
    );
  }

  void _handleNotificationTap(RemoteMessage message) {
    final navigator = _navigatorKey?.currentState;
    if (navigator == null) return;

    final assignmentId = message.data['assignment_id'];
    final role = message.data['role'];
    final activeRole = _activeRole();
    if (assignmentId is String && assignmentId.isNotEmpty && role == 'worker') {
      if (activeRole != AppRole.worker) return;
      try {
        navigator.pushNamed(
          AppRoutes.assignmentDetail,
          arguments: assignmentId,
        );
      } catch (_) {
        // Notification payloads are external input; incomplete navigation data
        // must never crash the app.
      }
    }
  }

  String _safeText(String? value, String fallback) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? fallback : trimmed;
  }

  AppRole? _activeRole() {
    final context = _navigatorKey?.currentContext;
    if (context == null) return null;
    try {
      return context.read<RoleSessionController>().activeRole;
    } catch (_) {
      return null;
    }
  }
}
