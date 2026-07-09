import 'package:flutter/material.dart' hide RadioGroup;
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/shimmer_widgets.dart' as shimmer;
import '../../core/models/bank_account_model.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});
  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen>
    with SingleTickerProviderStateMixin {
  Map<String, dynamic>? _data;
  Map<String, dynamic>? _balanceData;
  bool _loading = true;
  String? _error;
  late AnimationController _fadeCtrl;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _fadeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _fadeAnim = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);
    _load();
  }

  @override
  void dispose() {
    _fadeCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    _fadeCtrl.reset();
    try {
      final results = await Future.wait([
        ApiService.get('/admin/dashboard'),
        ApiService.get('/admin/commission/balance'),
      ]);
      _data = results[0]['data'] as Map<String, dynamic>;
      _balanceData = results[1]['data'] as Map<String, dynamic>;
      _fadeCtrl.forward();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load dashboard';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final auth = context.read<AuthProvider>();
    final navigator = Navigator.of(context);
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
      if (mounted) navigator.pushReplacementNamed('/login');
    }
  }

  Future<void> _settleCommissions() async {
    final auth = context.read<AuthProvider>();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    List<BankAccountModel> accounts = [];
    try {
      final res = await ApiService.get('/admin/bank-accounts');
      accounts = (res['data'] as List)
          .map((e) => BankAccountModel.fromJson(e))
          .toList();
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to load admin bank accounts')),
        );
      }
      return;
    }

    if (accounts.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please add a bank account in admin settings first'),
          ),
        );
      }
      return;
    }

    BankAccountModel? selectedAccount = accounts.firstWhere(
      (a) => a.isPrimary,
      orElse: () => accounts.first,
    );

    if (!mounted) return;

    final finalAccount = await showDialog<BankAccountModel>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (dialogCtx, setDialogState) => AlertDialog(
          title: const Text('Select Bank Account'),
          content: RadioGroup<BankAccountModel>(
            groupValue: selectedAccount,
            onChanged: (val) => setDialogState(() => selectedAccount = val),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Choose where to transfer the commissions:'),
                const SizedBox(height: 12),
                ...accounts.map(
                  (acc) => RadioListTile<BankAccountModel>(
                    title: Text(
                      acc.bankName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                    subtitle: Text(
                      acc.accountNumber,
                      style: const TextStyle(fontSize: 12),
                    ),
                    value: acc,
                    // ignore: deprecated_member_use
                    groupValue: selectedAccount,
                    // ignore: deprecated_member_use
                    onChanged: (val) =>
                        setDialogState(() => selectedAccount = val),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx, null),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(dialogCtx, selectedAccount),
              style: ElevatedButton.styleFrom(minimumSize: Size.zero),
              child: const Text('Proceed'),
            ),
          ],
        ),
      ),
    );

    if (finalAccount == null || !mounted) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    try {
      await ApiService.post('/admin/commission/settle', {
        'bankAccountId': finalAccount.id,
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Commission settlement initiated successfully!'),
          ),
        );
        _load();
        auth.refreshProfile();
      }
    } on ApiException catch (e) {
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: AppTheme.error),
        );
      }
    } catch (_) {
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Settlement failed'),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          slivers: [
            // ── Gradient header ──────────────────────────────────────
            SliverAppBar(
              expandedHeight: 160,
              pinned: true,
              backgroundColor: AppTheme.primaryDark,
              elevation: 0,
              flexibleSpace: FlexibleSpaceBar(
                collapseMode: CollapseMode.pin,
                background: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Color(0xFF312E81),
                        AppTheme.primaryDark,
                        AppTheme.primary,
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(20, 60, 20, 20),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'ADMIN PANEL',
                              style: TextStyle(
                                color: Colors.white70,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.5,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Hello, ${auth.user?.name.split(' ').first ?? 'Admin'} 👋',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Icon(
                          Icons.admin_panel_settings_rounded,
                          color: Colors.white,
                          size: 28,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                IconButton(
                  icon: const Icon(
                    Icons.account_balance_outlined,
                    color: Colors.white,
                  ),
                  tooltip: 'Bank Accounts',
                  onPressed: () => Navigator.pushNamed(
                    context,
                    '/admin/bank-accounts',
                  ).then((_) => _load()),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  onPressed: _load,
                ),
                IconButton(
                  icon: const Icon(Icons.logout, color: Colors.white70),
                  onPressed: () => _confirmLogout(context),
                ),
              ],
            ),

            if (_loading)
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    shimmer.ShimmerCard(height: 120),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: shimmer.ShimmerCard(height: 80)),
                        const SizedBox(width: 10),
                        Expanded(child: shimmer.ShimmerCard(height: 80)),
                        const SizedBox(width: 10),
                        Expanded(child: shimmer.ShimmerCard(height: 80)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    shimmer.ShimmerCard(height: 100),
                    const SizedBox(height: 12),
                    shimmer.ShimmerCard(height: 80),
                  ]),
                ),
              )
            else if (_error != null)
              SliverFillRemaining(
                child: EmptyState(
                  icon: Icons.wifi_off,
                  title: 'Error',
                  subtitle: _error,
                  onAction: _load,
                  actionLabel: 'Retry',
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    FadeTransition(opacity: _fadeAnim, child: _buildBody()),
                  ]),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCommissionCard() {
    if (_balanceData == null) return const SizedBox.shrink();

    final double totalCommission =
        (_balanceData!['totalCollected'] as num?)?.toDouble() ?? 0.0;
    final double totalSettled =
        (_balanceData!['totalPaidOut'] as num?)?.toDouble() ?? 0.0;
    final double totalProcessing = 0.0; // Not tracked separately in backend
    final double withdrawableBalance =
        (_balanceData!['availableBalance'] as num?)?.toDouble() ?? 0.0;

    return GradientCard(
      gradient: AppTheme.headerGradient,
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Platform Commission',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.5,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Withdrawable Balance',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              if (withdrawableBalance >= 100)
                ElevatedButton(
                  onPressed: _settleCommissions,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: AppTheme.primary,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    minimumSize: Size.zero,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  child: const Text('Withdraw'),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            formatCurrency(withdrawableBalance),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 32,
              fontWeight: FontWeight.w800,
              letterSpacing: -1,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _CommStat(
                label: 'Total Earned',
                value: formatCurrency(totalCommission),
              ),
              Container(
                width: 1,
                height: 28,
                color: Colors.white.withValues(alpha: 0.3),
              ),
              _CommStat(label: 'Settled', value: formatCurrency(totalSettled)),
              if (totalProcessing > 0) ...[
                Container(
                  width: 1,
                  height: 28,
                  color: Colors.white.withValues(alpha: 0.3),
                ),
                _CommStat(
                  label: 'Processing',
                  value: formatCurrency(totalProcessing),
                  highlight: true,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    final merchants = _data!['merchants'] as Map<String, dynamic>? ?? {};
    final today = _data!['today'] as Map<String, dynamic>? ?? {};
    final month = _data!['month'] as Map<String, dynamic>? ?? {};
    final pending = _data!['pendingSettlements'] as Map<String, dynamic>? ?? {};
    final topMerch = _data!['topMerchants'] as List? ?? [];
    final recentTx = _data!['recentTransactions'] as List? ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Commission card (TOP priority) ─────────────────────────
        _buildCommissionCard(),
        const SizedBox(height: 16),

        // ── Pending transactions alert ────────────────────────────
        InkWell(
          onTap: () => Navigator.pushNamed(context, '/admin/transactions'),
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: AppTheme.primary.withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.credit_card_outlined,
                    color: AppTheme.primary,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Manage Transactions',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      Text(
                        'Review and update payment status',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 16,
                  color: AppTheme.primary,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // ── Pending settlements alert ──────────────────────────────
        if ((pending['count'] ?? 0) > 0) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.warning.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: AppTheme.warning.withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.pending_actions_rounded,
                    color: AppTheme.warning,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Pending Settlements',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      Text(
                        '${pending['count']} settlements awaiting',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  formatCurrency((pending['amount'] as num?)?.toDouble() ?? 0),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: AppTheme.warning,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        // ── Merchant stats ─────────────────────────────────────────
        const SectionHeader(title: 'Merchants'),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _AdminStatCard(
                  label: 'Total',
                  value: '${merchants['total'] ?? 0}',
                  icon: Icons.store_rounded,
                  color: AppTheme.primary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _AdminStatCard(
                  label: 'Active',
                  value: '${merchants['active'] ?? 0}',
                  icon: Icons.check_circle_outline_rounded,
                  color: AppTheme.accent,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _AdminStatCard(
                  label: 'KYC Pending',
                  value: '${merchants['pendingKYC'] ?? 0}',
                  icon: Icons.pending_outlined,
                  color: AppTheme.warning,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // ── Today stats ────────────────────────────────────────────
        const SectionHeader(title: "Today's Activity"),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: AppTheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE8EEF4)),
            boxShadow: AppTheme.softShadow,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              MetricTile(label: 'Payments', value: '${today['count'] ?? 0}'),
              Container(height: 36, width: 1, color: AppTheme.divider),
              MetricTile(
                label: 'Volume',
                value: formatCurrency(
                  (today['volume'] as num?)?.toDouble() ?? 0,
                ),
              ),
              Container(height: 36, width: 1, color: AppTheme.divider),
              MetricTile(
                label: 'Commission',
                value: formatCurrency(
                  (today['commission'] as num?)?.toDouble() ?? 0,
                ),
                valueColor: AppTheme.warning,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // ── 30-day stats ───────────────────────────────────────────
        const SectionHeader(title: '30-Day Overview'),
        const SizedBox(height: 10),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _AdminStatCard(
                  label: 'Volume',
                  icon: Icons.trending_up_rounded,
                  value: formatCurrency(
                    (month['volume'] as num?)?.toDouble() ?? 0,
                  ),
                  color: AppTheme.primary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _AdminStatCard(
                  label: 'Commission',
                  icon: Icons.percent_rounded,
                  value: formatCurrency(
                    (month['commission'] as num?)?.toDouble() ?? 0,
                  ),
                  color: AppTheme.warning,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // ── Top merchants ──────────────────────────────────────────
        if (topMerch.isNotEmpty) ...[
          SectionHeader(
            title: 'Top Merchants',
            actionLabel: 'View All',
            onAction: () => Navigator.pushNamed(context, '/admin/merchants'),
          ),
          const SizedBox(height: 10),
          ...topMerch.asMap().entries.map(
            (e) => _TopMerchantTile(
              rank: e.key + 1,
              data: e.value as Map<String, dynamic>,
            ),
          ),
          const SizedBox(height: 16),
        ],

        // ── Recent transactions ────────────────────────────────────
        if (recentTx.isNotEmpty) ...[
          const SectionHeader(title: 'Recent Payments'),
          const SizedBox(height: 10),
          ...recentTx.map((tx) => _AdminTxTile(tx: tx)),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}

// ── Commission stat inside gradient card ──────────────────────────────────
class _CommStat extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;
  const _CommStat({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              color: highlight ? Colors.orangeAccent : Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.6),
              fontSize: 10,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Admin stat card ───────────────────────────────────────────────────────
class _AdminStatCard extends StatelessWidget {
  final String label, value;
  final IconData icon;
  final Color color;
  const _AdminStatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ),
          Text(
            label,
            style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ── Top merchant tile ─────────────────────────────────────────────────────
class _TopMerchantTile extends StatelessWidget {
  final int rank;
  final Map<String, dynamic> data;
  const _TopMerchantTile({required this.rank, required this.data});

  @override
  Widget build(BuildContext context) {
    final colors = [AppTheme.warning, AppTheme.textSecondary, AppTheme.accent];
    final rankColor = rank <= 3 ? colors[rank - 1] : AppTheme.primary;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE8EEF4)),
        boxShadow: AppTheme.softShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: rankColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(
                '#$rank',
                style: TextStyle(
                  color: rankColor,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  data['businessName'] ?? '',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
                Text(
                  data['merchantId'] ?? '',
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatCurrency((data['volume'] as num?)?.toDouble() ?? 0),
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
              Text(
                'Comm: ${formatCurrency((data['commission'] as num?)?.toDouble() ?? 0)}',
                style: const TextStyle(fontSize: 10, color: AppTheme.warning),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Admin transaction tile ─────────────────────────────────────────────────
class _AdminTxTile extends StatelessWidget {
  final dynamic tx;
  const _AdminTxTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    final String orderId = tx['orderId'] ?? '';
    final String businessName =
        (tx['merchantId'] as Map?)?['businessName'] ?? '';
    final String customerName = tx['customerName'] ?? '';
    final double amount = (tx['amount'] as num?)?.toDouble() ?? 0;
    final String status = tx['status'] ?? '';
    final String paymentMethod = tx['paymentMethod'] ?? '';

    const methodIcons = {
      'upi': Icons.payment,
      'card': Icons.credit_card,
      'netbanking': Icons.account_balance,
      'wallet': Icons.wallet,
    };
    final icon = methodIcons[paymentMethod] ?? Icons.receipt_long_rounded;

    const statusColors = {
      'success': Color(0xFF22C55E),
      'failed': Color(0xFFEF4444),
      'pending': Color(0xFFF59E0B),
      'cancelled': Color(0xFF94A3B8),
    };
    final statusColor = statusColors[status] ?? AppTheme.textSecondary;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE8EEF4)),
        boxShadow: AppTheme.softShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: AppTheme.primary),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  customerName.isNotEmpty ? customerName : 'Customer',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  businessName.isNotEmpty
                      ? '$orderId  •  $businessName'
                      : orderId,
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppTheme.textSecondary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatCurrency(amount),
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  status.toUpperCase(),
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: statusColor,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
