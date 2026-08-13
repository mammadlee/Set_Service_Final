import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/kiosk_url_policy.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/session/role_session_controller.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/app_strings.dart';
import '../../../shared/models/mobile_models.dart';
import '../../../shared/widgets/constrained_page.dart';
import '../../../shared/widgets/inline_message.dart';
import '../../../shared/widgets/loading_button.dart';
import '../../../shared/widgets/premium_components.dart';
import '../../../shared/widgets/status_pill.dart';
import '../../assignments/data/models/assignment.dart';
import '../../attendance/data/models/attendance.dart';
import '../../notifications/data/models/notification_item.dart';
import '../../notifications/presentation/widgets/notification_card.dart';
import '../../taxonomy/data/taxonomy_repository.dart';
import '../data/company_repository.dart';
import 'company_auth_controller.dart';

part 'company_dashboard_part.dart';
part 'company_orders_part.dart';
part 'company_assignments_part.dart';
part 'company_attendance_part.dart';
part 'company_notifications_part.dart';
part 'company_order_creation_part.dart';
part 'company_worker_profile_part.dart';
part 'company_reports_part.dart';
part 'company_shared_part.dart';

class CompanyHomeShell extends StatefulWidget {
  const CompanyHomeShell({super.key});

  @override
  State<CompanyHomeShell> createState() => _CompanyHomeShellState();
}

/// Public route targets used by role-aware push notification deep links.
/// The existing private widgets remain the single UI implementation.
class CompanyOrderDetailRoute extends StatefulWidget {
  const CompanyOrderDetailRoute({required this.orderId, super.key});

  final String orderId;

  @override
  State<CompanyOrderDetailRoute> createState() =>
      _CompanyOrderDetailRouteState();
}

class _CompanyOrderDetailRouteState extends State<CompanyOrderDetailRoute> {
  final _attendanceCache = _CompanyAttendanceStatusCache();

  @override
  Widget build(BuildContext context) {
    return _CompanyOrderDetailScreen(
      orderId: widget.orderId,
      attendanceCache: _attendanceCache,
    );
  }
}

class CompanyNotificationsRoute extends StatefulWidget {
  const CompanyNotificationsRoute({super.key});

  @override
  State<CompanyNotificationsRoute> createState() =>
      _CompanyNotificationsRouteState();
}

class _CompanyNotificationsRouteState extends State<CompanyNotificationsRoute> {
  final _attendanceCache = _CompanyAttendanceStatusCache();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.notifications)),
      body: Stack(
        children: [
          const Positioned.fill(
            child: IgnorePointer(child: LuxuryHotelBackdrop()),
          ),
          _CompanyNotificationsTab(attendanceCache: _attendanceCache),
        ],
      ),
    );
  }
}

class _CompanyHomeShellState extends State<CompanyHomeShell> {
  int _index = 0;
  late final List<Widget?> _tabs;
  final _attendanceCache = _CompanyAttendanceStatusCache();

  static const _titles = [
    'Müəssisə paneli',
    AppStrings.orders,
    'Təyin olunmuş işçilər',
    'Giriş və çıxışlar',
    AppStrings.notifications,
  ];

  @override
  void initState() {
    super.initState();
    _tabs = List<Widget?>.filled(_titles.length, null);
    _tabs[0] = _createTab(0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<CompanyAuthController>().registerPushForActiveSession();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _index == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _index != 0) {
          _selectTab(0);
        }
      },
      child: Scaffold(
        appBar: AppBar(title: Text(_titles[_index])),
        body: Stack(
          children: [
            const Positioned.fill(
              child: IgnorePointer(child: LuxuryHotelBackdrop()),
            ),
            IndexedStack(
              index: _index,
              children: List<Widget>.generate(_tabs.length, (index) {
                final tab = _tabs[index];
                return TickerMode(
                  enabled: _index == index,
                  child: tab ?? const SizedBox.shrink(),
                );
              }),
            ),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _selectedDestinationIndex,
          onDestinationSelected: _onDestinationSelected,
          destinations: const [
            NavigationDestination(
              selectedIcon: Icon(Icons.home_rounded),
              icon: Icon(Icons.home_outlined),
              label: AppStrings.home,
            ),
            NavigationDestination(
              selectedIcon: Icon(Icons.assignment_rounded),
              icon: Icon(Icons.assignment_outlined),
              label: AppStrings.orders,
            ),
            NavigationDestination(
              selectedIcon: Icon(Icons.groups_rounded),
              icon: Icon(Icons.groups_outlined),
              label: 'Heyət',
            ),
            NavigationDestination(
              selectedIcon: Icon(Icons.notifications_rounded),
              icon: Icon(Icons.notifications_outlined),
              label: AppStrings.alerts,
            ),
            NavigationDestination(
              icon: Icon(Icons.menu_rounded),
              label: 'Daha çox',
            ),
          ],
        ),
      ),
    );
  }

  int get _selectedDestinationIndex {
    return switch (_index) {
      0 => 0,
      1 => 1,
      2 => 2,
      4 => 3,
      _ => 4,
    };
  }

  Widget _createTab(int index) {
    return switch (index) {
      0 => const _CompanyDashboardTab(),
      1 => _CompanyOrdersTab(attendanceCache: _attendanceCache),
      2 => _CompanyAssignmentsTab(attendanceCache: _attendanceCache),
      3 => const _CompanyAttendanceTab(),
      4 => _CompanyNotificationsTab(attendanceCache: _attendanceCache),
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

  void _onDestinationSelected(int value) {
    if (value == 4) {
      _showMoreMenu();
      return;
    }
    final nextIndex = value == 3 ? 4 : value;
    _selectTab(nextIndex);
  }

  Future<void> _showMoreMenu() async {
    final selected = await showPremiumBottomSheet<_CompanyMoreAction>(
      context: context,
      child: Column(
        children: const [
          _MoreTile(
            icon: Icons.swap_horiz_rounded,
            title: 'Giriş-çıxış',
            action: _CompanyMoreAction.attendance,
          ),
          _MoreTile(
            icon: Icons.bar_chart_rounded,
            title: 'Hesabat',
            action: _CompanyMoreAction.reports,
          ),
          _MoreTile(
            icon: Icons.logout_rounded,
            title: 'Hesabdan çıx',
            action: _CompanyMoreAction.logout,
          ),
        ],
      ),
    );

    if (!mounted || selected == null) return;
    switch (selected) {
      case _CompanyMoreAction.attendance:
        _selectTab(3);
        break;
      case _CompanyMoreAction.reports:
        await Navigator.of(context).push<void>(
          MaterialPageRoute(builder: (_) => const _CompanyReportsScreen()),
        );
        break;
      case _CompanyMoreAction.logout:
        await context.read<CompanyAuthController>().logout();
        if (mounted) {
          await context.read<RoleSessionController>().clearRole();
        }
        break;
    }
  }
}
