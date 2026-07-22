import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

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
import '../data/admin_repository.dart';
import 'admin_auth_controller.dart';

part 'admin_dashboard_parts.dart';
part 'admin_reports_parts.dart';
part 'admin_approvals_parts.dart';
part 'admin_orders_parts.dart';
part 'admin_directories_parts.dart';
part 'admin_assignments_parts.dart';
part 'admin_attendance_parts.dart';
part 'admin_notifications_parts.dart';
part 'admin_shared_parts.dart';

class AdminHomeShell extends StatefulWidget {
  const AdminHomeShell({super.key});

  @override
  State<AdminHomeShell> createState() => _AdminHomeShellState();
}

/// Public route targets used by permission-aware admin push deep links.
class AdminOrderDetailRoute extends StatelessWidget {
  const AdminOrderDetailRoute({required this.orderId, super.key});

  final String orderId;

  @override
  Widget build(BuildContext context) {
    return _AdminOrderDetailScreen(orderId: orderId);
  }
}

class AdminNotificationsRoute extends StatelessWidget {
  const AdminNotificationsRoute({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.notifications)),
      body: const _AdminBackdrop(child: _AdminNotificationsTab()),
    );
  }
}

class _AdminHomeShellState extends State<AdminHomeShell> {
  int _index = 0;
  late final List<Widget?> _tabs;

  static const _titles = [
    'Kontrol paneli',
    'Təsdiqlər',
    AppStrings.orders,
    'Təyinatlar',
    'Davamiyyət',
    'İşçilər',
    'Müəssisələr',
    AppStrings.reports,
    AppStrings.notifications,
  ];

  @override
  void initState() {
    super.initState();
    _tabs = List<Widget?>.filled(_titles.length, null);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<AdminAuthController>().registerPushForActiveSession();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AdminAuthController>();
    final allowedIndexes = _allowedAdminIndexes(auth);
    final activeIndex = allowedIndexes.contains(_index)
        ? _index
        : (allowedIndexes.isEmpty ? 0 : allowedIndexes.first);
    if (allowedIndexes.isNotEmpty) {
      _tabs[activeIndex] ??= _createTab(activeIndex);
    }
    return PopScope(
      canPop: activeIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && activeIndex != 0) {
          _selectTab(allowedIndexes.contains(0) ? 0 : allowedIndexes.first);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          toolbarHeight: 82,
          titleSpacing: 0,
          backgroundColor: BrandColors.creamBackground,
          surfaceTintColor: BrandColors.transparent,
          title: Text(
            _titles[activeIndex],
            style: const TextStyle(
              color: BrandColors.darkText,
              fontSize: 27,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.8,
            ),
          ),
        ),
        drawer: _AdminDrawer(
          allowedIndexes: allowedIndexes,
          selectedIndex: activeIndex,
          adminName: auth.adminName,
          onSelected: _selectTab,
          onLogout: auth.isSubmitting
              ? null
              : () async {
                  await context.read<AdminAuthController>().logout();
                  if (context.mounted) {
                    await context.read<RoleSessionController>().clearRole();
                  }
                },
        ),
        body: Stack(
          children: [
            const Positioned.fill(
              child: IgnorePointer(child: LuxuryHotelBackdrop()),
            ),
            allowedIndexes.isEmpty
                ? const _PermissionDeniedView()
                : IndexedStack(
                    index: activeIndex,
                    children: List<Widget>.generate(_tabs.length, (index) {
                      final tab = _tabs[index];
                      return TickerMode(
                        enabled: activeIndex == index,
                        child: tab ?? const SizedBox.shrink(),
                      );
                    }),
                  ),
          ],
        ),
      ),
    );
  }

  Widget _createTab(int index) {
    return switch (index) {
      0 => _AdminDashboardTab(onNavigate: _selectTab),
      1 => const _ApprovalsTab(),
      2 => const _AdminOrdersTab(),
      3 => const _AdminAssignmentsTab(),
      4 => const _AdminAttendanceTab(),
      5 => const _AdminWorkersDirectoryTab(),
      6 => const _AdminCompaniesDirectoryTab(),
      7 => const _AdminReportsTab(),
      8 => const _AdminNotificationsTab(),
      _ => const SizedBox.shrink(),
    };
  }

  void _selectTab(int index) {
    if (_index == index && _tabs[index] != null) return;
    setState(() {
      _tabs[index] ??= _createTab(index);
      _index = index;
    });
  }
}

List<int> _allowedAdminIndexes(AdminAuthController auth) {
  final result = <int>[];
  for (final entry in _adminIndexPermissions.entries) {
    if (entry.value.any(auth.hasPermission)) result.add(entry.key);
  }
  return result;
}

const _adminIndexPermissions = <int, List<String>>{
  0: ['view_dashboard'],
  1: ['manage_workers', 'manage_companies'],
  2: ['view_orders'],
  3: ['view_assignments'],
  4: ['view_attendance'],
  5: ['view_workers'],
  6: ['view_companies'],
  7: ['view_reports'],
  8: ['view_notifications'],
};

class _AdminDrawer extends StatelessWidget {
  const _AdminDrawer({
    required this.allowedIndexes,
    required this.selectedIndex,
    required this.onSelected,
    required this.onLogout,
    this.adminName,
  });

  final List<int> allowedIndexes;
  final int selectedIndex;
  final String? adminName;
  final ValueChanged<int> onSelected;
  final Future<void> Function()? onLogout;

  @override
  Widget build(BuildContext context) {
    const items = [
      _DrawerItem('Kontrol paneli', Icons.grid_view_rounded),
      _DrawerItem('Təsdiqlər', Icons.verified_outlined),
      _DrawerItem('Sifarişlər', Icons.receipt_long_outlined),
      _DrawerItem('Təyinatlar', Icons.assignment_turned_in_outlined),
      _DrawerItem('Davamiyyət', Icons.center_focus_strong_outlined),
      _DrawerItem('İşçilər', Icons.groups_2_outlined),
      _DrawerItem('Müəssisələr', Icons.apartment_outlined),
      _DrawerItem('Hesabatlar', Icons.bar_chart_rounded),
      _DrawerItem('Bildirişlər', Icons.notifications_none_rounded),
    ];

    final visibleIndexes = allowedIndexes
        .where((index) => index >= 0 && index < items.length)
        .toList(growable: false);

    return Drawer(
      width: MediaQuery.sizeOf(context).width * 0.79,
      backgroundColor: BrandColors.cardCream,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            Container(
              width: double.infinity,
              height: 170,
              padding: const EdgeInsets.fromLTRB(18, 36, 18, 18),
              color: BrandColors.primaryBurgundy,
              child: Stack(
                children: [
                  Positioned(
                    left: -4,
                    top: 34,
                    right: -38,
                    child: Opacity(
                      opacity: 0.34,
                      child: Image.asset(
                        'assets/brand/set_outline_logo.png',
                        fit: BoxFit.fitWidth,
                        alignment: Alignment.topLeft,
                        filterQuality: FilterQuality.high,
                      ),
                    ),
                  ),
                  Positioned(
                    left: 4,
                    bottom: 0,
                    child: Text(
                      adminName?.trim().isNotEmpty == true
                          ? adminName!
                          : 'Admin',
                      style: const TextStyle(
                        color: BrandColors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 18, 12, 10),
                itemCount: visibleIndexes.length,
                itemBuilder: (context, index) {
                  final actualIndex = visibleIndexes[index];
                  final item = items[actualIndex];
                  final selected = actualIndex == selectedIndex;
                  return Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 2,
                    ),
                    child: ListTile(
                      minTileHeight: 54,
                      selected: selected,
                      selectedTileColor: const Color(0xFFFFC9C6),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28),
                      ),
                      leading: Icon(
                        item.icon,
                        color: selected
                            ? BrandColors.primaryBurgundy
                            : BrandColors.darkText,
                      ),
                      title: Text(
                        item.label,
                        style: TextStyle(
                          fontWeight: selected
                              ? FontWeight.w800
                              : FontWeight.w600,
                          fontSize: 18,
                        ),
                      ),
                      onTap: () {
                        Navigator.of(context).pop();
                        onSelected(actualIndex);
                      },
                    ),
                  );
                },
              ),
            ),
            const Divider(height: 1, color: BrandColors.accentGold),
            ListTile(
              minTileHeight: 72,
              contentPadding: const EdgeInsets.symmetric(horizontal: 24),
              leading: const Icon(Icons.logout, color: BrandColors.darkText),
              title: const Text(
                'Çıxış',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18),
              ),
              onTap: onLogout == null
                  ? null
                  : () async {
                      Navigator.of(context).pop();
                      await onLogout!.call();
                    },
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerItem {
  const _DrawerItem(this.label, this.icon);

  final String label;
  final IconData icon;
}

class _PermissionDeniedView extends StatelessWidget {
  const _PermissionDeniedView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: InlineMessage(message: 'Bu bölməyə giriş icazəniz yoxdur.'),
      ),
    );
  }
}

class _AdminBackdrop extends StatelessWidget {
  const _AdminBackdrop({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const Positioned.fill(
          child: IgnorePointer(child: LuxuryHotelBackdrop()),
        ),
        Positioned.fill(child: child),
      ],
    );
  }
}
