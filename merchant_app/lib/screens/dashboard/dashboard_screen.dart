import 'package:flutter/material.dart' hide RadioGroup;
import 'package:confetti/confetti.dart';
import 'package:merchant_app/screens/dashboard/widgets/today_card.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/models/transaction_model.dart';
import '../../core/models/bank_account_model.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/constants/app_constants.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen>
    with SingleTickerProviderStateMixin {
  late ConfettiController _confettiCtrl;
  Map<String, dynamic>? _summary;
  List<TransactionModel> _recentTx = [];
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
    _confettiCtrl = ConfettiController(duration: const Duration(seconds: 2));
    _load();
  }

  @override
  void dispose() {
    _confettiCtrl.dispose();
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
      final res = await ApiService.get('/merchant/dashboard');
      final data = res['data'] as Map<String, dynamic>;
      _summary = data;
      final txList = data['recentTransactions'] as List? ?? [];
      _recentTx = txList.map((e) => TransactionModel.fromJson(e)).toList();
      _fadeCtrl.forward();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load dashboard';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handleManualSettlement(BuildContext context) async {
    final auth = context.read<AuthProvider>();
    final merchant = auth.merchant;

    if (merchant?.kycStatus != 'approved') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('KYC approval is required for settlements'),
        ),
      );
      return;
    }

    if ((merchant?.pendingSettlement ?? 0) < 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Minimum settlement amount is ₹1')),
      );
      return;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    List<BankAccountModel> accounts = [];
    try {
      final res = await ApiService.get('/merchant/bank-accounts');
      accounts = (res['data'] as List)
          .map((e) => BankAccountModel.fromJson(e))
          .toList();
      if (context.mounted) Navigator.pop(context);
    } catch (_) {
      if (context.mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to load bank accounts')),
        );
      }
      return;
    }

    if (accounts.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please add a bank account in settings first'),
          ),
        );
      }
      return;
    }

    BankAccountModel? selectedAccount = accounts.firstWhere(
      (a) => a.isPrimary,
      orElse: () => accounts.first,
    );

    if (!context.mounted) return;

    final finalAccount = await showDialog<BankAccountModel>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (dialogCtx, setDialogState) => AlertDialog(
          title: const Text('Select Bank Account'),
          content: RadioGroup<BankAccountModel>(
            groupValue: selectedAccount,
            onChanged: (val) {
              setDialogState(() {
                selectedAccount = val;
              });
            },
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Choose where to transfer the funds:'),
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

    if (finalAccount == null || !context.mounted) return;
    // Trigger confetti on successful settlement initiation
    _confettiCtrl.play();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    try {
      await ApiService.post('/settlement/request', {
        'bankAccountId': finalAccount.id,
      });
      if (context.mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Settlement initiated successfully!')),
        );
        _load();
        auth.refreshProfile();
      }
    } on ApiException catch (e) {
      if (context.mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: AppTheme.error),
        );
      }
    } catch (_) {
      if (context.mounted) {
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
    final merchant = auth.merchant;

    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      body: RefreshIndicator(
        onRefresh: () async {
          await _load();
          await auth.refreshProfile();
        },
        child: CustomScrollView(
          slivers: [
            // ── Gradient header ─────────────────────────────────────
            SliverAppBar(
              expandedHeight: 180,
              pinned: true,
              backgroundColor: AppTheme.primary,
              elevation: 0,
              flexibleSpace: FlexibleSpaceBar(
                collapseMode: CollapseMode.pin,
                background: Container(
                  decoration: const BoxDecoration(
                    gradient: AppTheme.headerGradient,
                  ),
                  padding: const EdgeInsets.fromLTRB(20, 60, 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Hello, ${auth.user?.name.split(' ').first ?? ''} 👋',
                                style: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w400,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                merchant?.businessName ?? 'My Business',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                          _KycBadge(status: merchant?.kycStatus ?? 'pending'),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'ID: ${merchant?.merchantId ?? '—'}',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 11,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  onPressed: _load,
                ),
              ],
            ),

            if (_loading)
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    const ShimmerCard(height: 130),
                    const SizedBox(height: 12),
                    Row(
                      children: const [
                        Expanded(child: ShimmerCard(height: 90)),
                        SizedBox(width: 12),
                        Expanded(child: ShimmerCard(height: 90)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: const [
                        Expanded(child: ShimmerCard(height: 90)),
                        SizedBox(width: 12),
                        Expanded(child: ShimmerCard(height: 90)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const ShimmerCard(height: 100),
                    const SizedBox(height: 12),
                    const ShimmerCard(height: 70),
                    const SizedBox(height: 8),
                    const ShimmerCard(height: 70),
                    const SizedBox(height: 8),
                    const ShimmerCard(height: 70),
                  ]),
                ),
              )
            else if (_error != null)
              SliverFillRemaining(
                child: EmptyState(
                  icon: Icons.wifi_off,
                  title: 'Could not load dashboard',
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
                    Stack(
                      children: [
                        FadeTransition(
                          opacity: _fadeAnim,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              PendingCard(
                                amount: merchant?.pendingSettlement ?? 0,
                                preference:
                                    merchant?.settlementPreference ?? 'instant',
                                onSettle: () =>
                                    _handleManualSettlement(context),
                              ),
                              const SizedBox(height: 16),
                              StatsGrid(summary: _summary!),
                              const SizedBox(height: 16),
                              TodayCard(
                                today:
                                    _summary!['today']
                                        as Map<String, dynamic>? ??
                                    {},
                              ),
                              const SizedBox(height: 20),
                              SectionHeader(
                                title: 'Recent Payments',
                                actionLabel: 'See All',
                                onAction: () => Navigator.pushNamed(
                                  context,
                                  '/transactions',
                                ),
                              ),
                              const SizedBox(height: 10),
                              if (_recentTx.isEmpty)
                                const EmptyState(
                                  icon: Icons.receipt_long_outlined,
                                  title: 'No payments yet',
                                  subtitle:
                                      'Share your QR code to start collecting',
                                )
                              else
                                ..._recentTx.map((tx) => RecentTxTile(tx: tx)),
                              const SizedBox(height: 24),
                            ],
                          ),
                        ),
                        // Confetti overlay
                        Align(
                          alignment: Alignment.topCenter,
                          child: ConfettiWidget(
                            confettiController: _confettiCtrl,
                            blastDirectionality: BlastDirectionality.explosive,
                            particleDrag: 0.05,
                            emissionFrequency: 0.05,
                            numberOfParticles: 30,
                            gravity: 0.3,
                          ),
                        ),
                      ],
                    ),
                  ]),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── KYC badge ─────────────────────────────────────────────────────────────
class _KycBadge extends StatelessWidget {
  final String status;
  const _KycBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final isApproved = status == 'approved';
    final color = isApproved ? Colors.greenAccent : Colors.orangeAccent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.6), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isApproved ? Icons.verified : Icons.pending_outlined,
            size: 13,
            color: color,
          ),
          const SizedBox(width: 4),
          Text(
            isApproved
                ? 'Verified'
                : status[0].toUpperCase() + status.substring(1),
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Pending settlement card ────────────────────────────────────────────────
class PendingCard extends StatelessWidget {
  final double amount;
  final String preference;
  final VoidCallback? onSettle;

  const PendingCard({
    super.key,
    required this.amount,
    required this.preference,
    this.onSettle,
  });

  @override
  Widget build(BuildContext context) {
    final isOnDemand = preference == 'on_demand';
    return GradientCard(
      gradient: AppTheme.accentGradient,
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Pending Settlement',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  const SizedBox(height: 6),
                  AnimatedCounter(
                    value: amount,
                    formatter: formatCurrency,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.account_balance_wallet_outlined,
                  color: Colors.white,
                  size: 28,
                ),
              ),
            ],
          ),
          if (isOnDemand) ...[
            const SizedBox(height: 16),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppTheme.accentDark,
                elevation: 0,
                minimumSize: const Size.fromHeight(46),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: onSettle,
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.send_rounded, size: 18),
                  SizedBox(width: 8),
                  Text(
                    'Settle Now',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                ],
              ),
            ),
          ] else ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.autorenew, color: Colors.white70, size: 14),
                const SizedBox(width: 6),
                Text(
                  'Auto-settlement enabled',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.75),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ── Stats grid ────────────────────────────────────────────────────────────
class StatsGrid extends StatelessWidget {
  final Map<String, dynamic> summary;
  const StatsGrid({super.key, required this.summary});

  @override
  Widget build(BuildContext context) {
    final s = summary['summary'] as Map<String, dynamic>? ?? {};
    final today = summary['today'] as Map<String, dynamic>? ?? {};
    return Column(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: StatCard(
                  label: 'Total Collected',
                  value: formatCurrency(
                    (s['totalCollected'] as num?)?.toDouble() ?? 0,
                  ),
                  icon: Icons.trending_up_rounded,
                  iconColor: AppTheme.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: StatCard(
                  label: 'Total Settled',
                  value: formatCurrency(
                    (s['totalSettled'] as num?)?.toDouble() ?? 0,
                  ),
                  icon: Icons.check_circle_outline_rounded,
                  iconColor: AppTheme.accent,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: StatCard(
                  label: 'Pending Amount',
                  value: formatCurrency(
                    (s['pendingSettlement'] as num?)?.toDouble() ?? 0,
                  ),
                  icon: Icons.hourglass_top_rounded,
                  iconColor: AppTheme.info,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: StatCard(
                  label: "Today's Payments",
                  value: '${today['count'] ?? 0}',
                  icon: Icons.receipt_long_outlined,
                  iconColor: AppTheme.warning,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Recent transaction tile ────────────────────────────────────────────────
class RecentTxTile extends StatelessWidget {
  final TransactionModel tx;
  const RecentTxTile({super.key, required this.tx});

  @override
  Widget build(BuildContext context) {
    const methodIcons = {
      'upi': Icons.payment,
      'card': Icons.credit_card,
      'netbanking': Icons.account_balance,
      'wallet': Icons.wallet,
    };
    final icon = methodIcons[tx.paymentMethod] ?? Icons.receipt;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE8EEF4)),
        boxShadow: AppTheme.softShadow,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => Navigator.pushNamed(
            context,
            '/transaction-detail',
            arguments: tx.orderId,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: AppTheme.primary, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tx.customerName?.isNotEmpty == true
                            ? tx.customerName!
                            : 'Customer',
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${tx.orderId}  •  ${formatDate(tx.createdAt)}',
                        style: const TextStyle(
                          fontSize: 11,
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
                      formatCurrency(tx.amount),
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    StatusChip(
                      status: tx.status,
                      colorMap: AppConstants.txStatusColor,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
