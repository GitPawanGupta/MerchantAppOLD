import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/constants/app_constants.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // ProfileScreen refreshes on its own via initState — no need to refresh here
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      context.read<AuthProvider>().refreshProfile();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final merchant = auth.merchant;

    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      body: CustomScrollView(
        slivers: [
          // ── Gradient header with avatar ──────────────────────────
          SliverAppBar(
            expandedHeight: 200,
            pinned: true,
            backgroundColor: AppTheme.primary,
            elevation: 0,
            flexibleSpace: FlexibleSpaceBar(
              collapseMode: CollapseMode.pin,
              background: Container(
                decoration: const BoxDecoration(
                  gradient: AppTheme.headerGradient,
                ),
                padding: const EdgeInsets.fromLTRB(20, 70, 20, 20),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Row(
                      children: [
                        // Avatar with gradient ring
                        Container(
                          padding: const EdgeInsets.all(3),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: [
                                Colors.white.withValues(alpha: 0.8),
                                Colors.white.withValues(alpha: 0.3),
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                          ),
                          child: CircleAvatar(
                            radius: 32,
                            backgroundColor: Colors.white.withValues(
                              alpha: 0.2,
                            ),
                            child: Text(
                              user?.name.isNotEmpty == true
                                  ? user!.name[0].toUpperCase()
                                  : 'M',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 28,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                user?.name ?? '',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 20,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Icon(
                                    Icons.email_outlined,
                                    size: 13,
                                    color: Colors.white.withValues(alpha: 0.7),
                                  ),
                                  const SizedBox(width: 6),
                                  Flexible(
                                    child: Text(
                                      user?.email ?? '',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.white.withValues(
                                          alpha: 0.7,
                                        ),
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Row(
                                children: [
                                  Icon(
                                    Icons.phone_outlined,
                                    size: 13,
                                    color: Colors.white.withValues(alpha: 0.7),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    user?.phone ?? '',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.white.withValues(
                                        alpha: 0.7,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Body ─────────────────────────────────────────────────
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // ── Business info card ──────────────────────────────
                if (merchant != null) ...[
                  _InfoCard(
                    title: 'Business Info',
                    icon: Icons.business_rounded,
                    children: [
                      InfoRow(label: 'Merchant ID', value: merchant.merchantId),
                      InfoRow(
                        label: 'Business Name',
                        value: merchant.businessName,
                      ),
                      InfoRow(
                        label: 'Status',
                        value: merchant.status.toUpperCase(),
                        valueColor: merchant.status == 'active'
                            ? AppTheme.accent
                            : AppTheme.warning,
                      ),
                      InfoRow(
                        label: 'KYC Status',
                        value: merchant.kycStatus.toUpperCase(),
                        valueColor: Color(
                          AppConstants.kycStatusColor[merchant.kycStatus] ??
                              0xFF94A3B8,
                        ),
                        isLast: true,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                // ── Menu ──────────────────────────────────────────
                _ProfileMenu(
                  items: [
                    _MenuItem(
                      icon: Icons.edit_outlined,
                      label: 'Edit Business Profile',
                      onTap: () =>
                          Navigator.pushNamed(context, '/edit-profile'),
                    ),
                    _MenuItem(
                      icon: Icons.bar_chart_rounded,
                      label: 'Reports & Analytics',
                      onTap: () => Navigator.pushNamed(context, '/reports'),
                    ),
                    _MenuItem(
                      icon: Icons.verified_outlined,
                      label: 'KYC Verification',
                      subtitle: merchant?.kycStatus.toUpperCase() ?? 'PENDING',
                      subtitleColor: Color(
                        AppConstants.kycStatusColor[merchant?.kycStatus] ??
                            0xFF94A3B8,
                      ),
                      onTap: () => Navigator.pushNamed(context, '/kyc'),
                    ),
                    _MenuItem(
                      icon: Icons.account_balance_outlined,
                      label: 'Bank Accounts',
                      subtitle: (merchant?.bankAccountCount ?? 0) > 0
                          ? '${merchant!.bankAccountCount} account${merchant.bankAccountCount > 1 ? 's' : ''} added'
                          : 'Not added',
                      onTap: () =>
                          Navigator.pushNamed(context, '/bank-accounts'),
                    ),
                    _MenuItem(
                      icon: Icons.lock_outline_rounded,
                      label: 'Change Password',
                      onTap: () =>
                          Navigator.pushNamed(context, '/change-password'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // ── Settlement preference ────────────────────────
                _InfoCard(
                  title: 'Settlement Setting',
                  icon: Icons.tune_rounded,
                  children: [
                    const Text(
                      'Choose how you want to receive funds in your bank.',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 16),
                    _SettlementToggle(
                      value: merchant?.settlementPreference ?? 'instant',
                      onChanged: (val) async {
                        try {
                          await ApiService.post(
                            '/merchant/settlement-preference',
                            {'preference': val},
                          );
                          await auth.refreshProfile();
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Settlement preference updated'),
                              ),
                            );
                          }
                        } on ApiException catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(e.message),
                                backgroundColor: AppTheme.error,
                              ),
                            );
                          }
                        } catch (_) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Failed to update preference. Please try again.',
                                ),
                                backgroundColor: AppTheme.error,
                              ),
                            );
                          }
                        }
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // ── Sign out ─────────────────────────────────────
                _ProfileMenu(
                  items: [
                    _MenuItem(
                      icon: Icons.logout_rounded,
                      label: 'Sign Out',
                      iconColor: AppTheme.error,
                      labelColor: AppTheme.error,
                      onTap: () => _confirmLogout(context, auth),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const Center(
                  child: Text(
                    'v1.0.0',
                    style: TextStyle(fontSize: 12, color: AppTheme.textHint),
                  ),
                ),
                const SizedBox(height: 16),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context, AuthProvider auth) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Sign Out?'),
        content: const Text('You will need to sign in again.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.error,
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await auth.logout();
      if (context.mounted) {
        Navigator.pushReplacementNamed(context, '/login');
      }
    }
  }
}

// ── Info card with title + icon ────────────────────────────────────────────
class _InfoCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<Widget> children;
  const _InfoCard({
    required this.title,
    required this.icon,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE8EEF4)),
        boxShadow: AppTheme.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 16, color: AppTheme.primary),
              ),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

// ── Settlement toggle ─────────────────────────────────────────────────────
class _SettlementToggle extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const _SettlementToggle({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _ToggleOption(
            label: 'Auto (Instant)',
            icon: Icons.flash_on_rounded,
            selected: value == 'instant',
            onTap: () => onChanged('instant'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ToggleOption(
            label: 'On-Demand',
            icon: Icons.touch_app_rounded,
            selected: value == 'on_demand',
            onTap: () => onChanged('on_demand'),
          ),
        ),
      ],
    );
  }
}

class _ToggleOption extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _ToggleOption({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.primary.withValues(alpha: 0.1)
              : AppTheme.bgLight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? AppTheme.primary.withValues(alpha: 0.4)
                : AppTheme.divider,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(
              icon,
              size: 22,
              color: selected ? AppTheme.primary : AppTheme.textSecondary,
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? AppTheme.primary : AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Profile menu ──────────────────────────────────────────────────────────
class _ProfileMenu extends StatelessWidget {
  final List<_MenuItem> items;
  const _ProfileMenu({required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE8EEF4)),
        boxShadow: AppTheme.softShadow,
      ),
      child: Column(
        children: items.asMap().entries.map((e) {
          final isLast = e.key == items.length - 1;
          return Column(
            children: [
              Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: isLast && e.key == 0
                      ? BorderRadius.circular(16)
                      : e.key == 0
                      ? const BorderRadius.vertical(top: Radius.circular(16))
                      : isLast
                      ? const BorderRadius.vertical(bottom: Radius.circular(16))
                      : BorderRadius.zero,
                  onTap: e.value.onTap,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: (e.value.iconColor ?? AppTheme.primary)
                                .withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            e.value.icon,
                            color: e.value.iconColor ?? AppTheme.primary,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                e.value.label,
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color:
                                      e.value.labelColor ??
                                      AppTheme.textPrimary,
                                ),
                              ),
                              if (e.value.subtitle != null) ...[
                                const SizedBox(height: 2),
                                Text(
                                  e.value.subtitle!,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color:
                                        e.value.subtitleColor ??
                                        AppTheme.textSecondary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right_rounded,
                          color: AppTheme.textHint,
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (!isLast)
                Divider(
                  height: 1,
                  indent: 56,
                  color: AppTheme.divider.withValues(alpha: 0.5),
                ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

class _MenuItem {
  final IconData icon;
  final String label;
  final String? subtitle;
  final Color? iconColor;
  final Color? labelColor;
  final Color? subtitleColor;
  final VoidCallback onTap;

  const _MenuItem({
    required this.icon,
    required this.label,
    this.subtitle,
    this.iconColor,
    this.labelColor,
    this.subtitleColor,
    required this.onTap,
  });
}
