import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/app_strings.dart';
import '../../../../core/session/role_session_controller.dart';
import '../../../assignments/presentation/screens/assignment_list_screen.dart';
import '../../../attendance/presentation/screens/worker_qr_screen.dart';
import '../../../auth/presentation/controllers/auth_controller.dart';
import '../../../dashboard/presentation/screens/worker_dashboard_screen.dart';
import '../../../notifications/presentation/screens/notifications_screen.dart';
import '../../../worker/presentation/screens/worker_profile_screen.dart';

class WorkerHomeShell extends StatefulWidget {
  const WorkerHomeShell({super.key});

  @override
  State<WorkerHomeShell> createState() => _WorkerHomeShellState();
}

class _WorkerHomeShellState extends State<WorkerHomeShell> {
  int _index = 0;
  late final List<Widget?> _tabs;

  static const _titles = [
    'Ana səhifə',
    'İşlərim',
    'QR oxut',
    'Bildirişlər',
    'Profilim',
  ];

  @override
  void initState() {
    super.initState();
    _tabs = List<Widget?>.filled(_titles.length, null);
    _tabs[0] = _createTab(0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<AuthController>().registerPushForActiveSession();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final media = MediaQuery.of(context);
    final compact = media.size.width < 380;
    final titleFontSize = compact ? 23.0 : 27.0;
    final navHeight = compact ? 78.0 : 88.0;

    return PopScope(
      canPop: _index == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _index != 0) {
          _selectTab(0);
        }
      },
      child: Scaffold(
        resizeToAvoidBottomInset: true,
        appBar: AppBar(
          toolbarHeight: compact ? 68 : 76,
          titleSpacing: compact ? 14 : 20,
          backgroundColor: BrandColors.creamBackground,
          surfaceTintColor: BrandColors.transparent,
          title: Text(
            _titles[_index],
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: BrandColors.darkText,
              fontSize: titleFontSize,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
          actions: [
            if (_index == 0)
              IconButton(
                tooltip: AppStrings.logout,
                onPressed: auth.isSubmitting
                    ? null
                    : () async {
                        await context.read<AuthController>().logout();
                        if (context.mounted) {
                          await context
                              .read<RoleSessionController>()
                              .clearRole();
                        }
                      },
                icon: Icon(Icons.logout_rounded, size: compact ? 26 : 28),
              ),
            SizedBox(width: compact ? 2 : 8),
          ],
        ),
        body: IndexedStack(
          index: _index,
          children: List<Widget>.generate(_tabs.length, (index) {
            final tab = _tabs[index];
            return TickerMode(
              enabled: _index == index,
              child: tab ?? const SizedBox.shrink(),
            );
          }),
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: NavigationBar(
            height: navHeight,
            labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
            selectedIndex: _index,
            onDestinationSelected: _selectTab,
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home_rounded),
                label: 'Ana səhifə',
              ),
              NavigationDestination(
                icon: Icon(Icons.work_outline_rounded),
                selectedIcon: Icon(Icons.work_rounded),
                label: 'İşlərim',
              ),
              NavigationDestination(
                icon: Icon(Icons.qr_code_scanner_outlined),
                selectedIcon: Icon(Icons.qr_code_scanner),
                label: 'QR oxut',
              ),
              NavigationDestination(
                icon: Icon(Icons.notifications_outlined),
                selectedIcon: Icon(Icons.notifications),
                label: 'Bildirişlər',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'Profil',
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _createTab(int index) {
    return switch (index) {
      0 => const WorkerDashboardScreen(),
      1 => const AssignmentListScreen(embedded: true),
      2 => const WorkerQrScreen(),
      3 => const NotificationsScreen(),
      4 => const WorkerProfileScreen(),
      _ => const SizedBox.shrink(),
    };
  }

  void _selectTab(int index) {
    if (_index == index) return;
    setState(() {
      _tabs[index] ??= _createTab(index);
      _index = index;
    });
  }
}
