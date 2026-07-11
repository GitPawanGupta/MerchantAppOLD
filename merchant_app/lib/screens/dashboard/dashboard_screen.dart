import 'dart:async';
import 'package:flutter/material.dart' hide RadioGroup;
import 'package:confetti/confetti.dart';
import 'package:merchant_app/screens/dashboard/widgets/today_card.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/providers/notification_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/models/transaction_model.dart';
import '../../core/models/bank_account_model.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/shimmer_widgets.dart' as shimmer;
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
  bool _hasPendingSettlement = false;
  StreamSubscription<Map<String, dynamic>>? _paymentSub;

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

    // Subscribe after first frame so provider is available
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _paymentSub = context
          .read<NotificationProvider>()
          .onPaymentReceived
          .listen(_onPaymentArrived);
    });
  }

  /// Called when FCM payment_received message arrives while app is open.
  /// Refreshes dashboard data + merchant wallet balance automatically.
  void _onPaymentArrived(Map<String, dynamic> data) {
    debugPrint('[DashboardScreen] Payment arrived — auto refreshing...');
    _load();
    context.read<AuthProvider>().refreshProfile();
    // Play confetti for a delightful UX
    _confettiCtrl.play();
  }

  @override
  void dispose() {
    _paymentSub?.cancel();
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

      // Extract hasPendingSettlement flag from summary
      final summary = data['summary'] as Map<String, dynamic>? ?? {};
      _hasPendingSettlement = summary['hasPendingSettlement'] as bool? ?? false;

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
        // Show success message with 24hr timeline
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.green.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.check_circle,
                    color: Colors.green,
                    size: 32,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Settlement Requested',
                    style: TextStyle(fontSize: 18),
                  ),
                ),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Your settlement request has been submitted successfully!',
                  style: TextStyle(fontSize: 14),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.info.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppTheme.info.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.schedule, color: AppTheme.info, size: 20),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Amount will be credited to your bank account within 24 hours.',
                          style: TextStyle(fontSize: 13, height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            actions: [
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  minimumSize: const Size.fromHeight(44),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('Got it'),
              ),
            ],
          ),
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
                // Notification bell
                Consumer<NotificationProvider>(
                  builder: (context, np, child) => Stack(
                    alignment: Alignment.center,
                    children: [
                      IconButton(
                        icon: const Icon(
                          Icons.notifications_outlined,
                          color: Colors.white,
                        ),
                        onPressed: () {
                          Navigator.pushNamed(context, '/notifications');
                        },
                      ),
                      if (np.unreadCount > 0)
                        Positioned(
                          top: 8,
                          right: 8,
                          child: Container(
                            padding: const EdgeInsets.all(3),
                            decoration: const BoxDecoration(
                              color: Color(0xFFEF4444),
                              shape: BoxShape.circle,
                            ),
                            constraints: const BoxConstraints(
                              minWidth: 16,
                              minHeight: 16,
                            ),
                            child: Text(
                              np.unreadCount > 99 ? '99+' : '${np.unreadCount}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
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
                    shimmer.ShimmerCard(height: 130),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: shimmer.ShimmerCard(height: 90)),
                        const SizedBox(width: 12),
                        Expanded(child: shimmer.ShimmerCard(height: 90)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: shimmer.ShimmerCard(height: 90)),
                        const SizedBox(width: 12),
                        Expanded(child: shimmer.ShimmerCard(height: 90)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    shimmer.ShimmerCard(height: 100),
                    const SizedBox(height: 12),
                    shimmer.ShimmerCard(height: 70),
                    const SizedBox(height: 8),
                    shimmer.ShimmerCard(height: 70),
                    const SizedBox(height: 8),
                    shimmer.ShimmerCard(height: 70),
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
                                hasPendingSettlement: _hasPendingSettlement,
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
  final bool hasPendingSettlement;
  final VoidCallback? onSettle;

  const PendingCard({
    super.key,
    required this.amount,
    required this.hasPendingSettlement,
    this.onSettle,
  });

  @override
  Widget build(BuildContext context) {
    // Show ₹0 if settlement is pending, otherwise show actual amount
    final displayAmount = hasPendingSettlement ? 0.0 : amount;
    final isButtonEnabled = !hasPendingSettlement && amount >= 1;

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
                  Row(
                    children: [
                      const Text(
                        'Pending Settlement',
                        style: TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                      if (hasPendingSettlement) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.orange.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(
                              color: Colors.orange.withValues(alpha: 0.5),
                            ),
                          ),
                          child: const Text(
                            'PROCESSING',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 6),
                  AnimatedCounter(
                    value: displayAmount,
                    formatter: formatCurrency,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                  if (hasPendingSettlement) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(
                          Icons.schedule,
                          color: Colors.white.withValues(alpha: 0.7),
                          size: 12,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Settlement in progress',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.7),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  hasPendingSettlement
                      ? Icons.hourglass_bottom
                      : Icons.account_balance_wallet_outlined,
                  color: Colors.white,
                  size: 28,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Tooltip(
            message: isButtonEnabled
                ? ''
                : hasPendingSettlement
                ? 'Settlement request is being processed'
                : 'Minimum settlement amount is ₹1',
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: isButtonEnabled
                    ? Colors.white
                    : Colors.white.withValues(alpha: 0.3),
                foregroundColor: isButtonEnabled
                    ? AppTheme.accentDark
                    : Colors.white.withValues(alpha: 0.5),
                elevation: 0,
                minimumSize: const Size.fromHeight(46),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: isButtonEnabled ? onSettle : null,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    isButtonEnabled ? Icons.send_rounded : Icons.lock_outline,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    isButtonEnabled
                        ? 'Request Settlement'
                        : hasPendingSettlement
                        ? 'Settlement Requested'
                        : 'Request Settlement',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
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
