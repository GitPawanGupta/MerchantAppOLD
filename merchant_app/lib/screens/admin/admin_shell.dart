import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import 'admin_dashboard_screen.dart';
import 'admin_merchants_screen.dart';
import 'admin_transactions_screen.dart';
import 'admin_settlements_screen.dart';
import 'admin_commission_screen.dart';
import 'admin_reports_screen.dart';

class AdminShell extends StatefulWidget {
  const AdminShell({super.key});
  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  int _index = 0;

  static const _tabs = [
    NavigationDestination(
      icon: Icon(Icons.dashboard_outlined),
      selectedIcon: Icon(Icons.dashboard),
      label: 'Home',
    ),
    NavigationDestination(
      icon: Icon(Icons.store_outlined),
      selectedIcon: Icon(Icons.store),
      label: 'Stores',
    ),
    NavigationDestination(
      icon: Icon(Icons.receipt_long_outlined),
      selectedIcon: Icon(Icons.receipt_long),
      label: 'Txns',
    ),
    NavigationDestination(
      icon: Icon(Icons.account_balance_outlined),
      selectedIcon: Icon(Icons.account_balance),
      label: 'Settle',
    ),
    NavigationDestination(
      icon: Icon(Icons.percent_outlined),
      selectedIcon: Icon(Icons.percent),
      label: 'Fees',
    ),
    NavigationDestination(
      icon: Icon(Icons.bar_chart_outlined),
      selectedIcon: Icon(Icons.bar_chart),
      label: 'Reports',
    ),
  ];

  final _pages = const [
    AdminDashboardScreen(),
    AdminMerchantsScreen(),
    AdminTransactionsScreen(),
    AdminSettlementsScreen(),
    AdminCommissionScreen(),
    AdminReportsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: Theme(
        data: Theme.of(context).copyWith(
          navigationBarTheme: NavigationBarThemeData(
            backgroundColor: AppTheme.surface,
            indicatorColor: AppTheme.primary.withValues(alpha: 0.12),
            labelTextStyle: WidgetStateProperty.resolveWith((states) {
              final selected = states.contains(WidgetState.selected);
              return TextStyle(
                fontSize: 10,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? AppTheme.primary : AppTheme.textSecondary,
              );
            }),
            iconTheme: WidgetStateProperty.resolveWith((states) {
              final selected = states.contains(WidgetState.selected);
              return IconThemeData(
                size: 22,
                color: selected ? AppTheme.primary : AppTheme.textSecondary,
              );
            }),
          ),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
          destinations: _tabs,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          height: 70,
        ),
      ),
    );
  }
}
