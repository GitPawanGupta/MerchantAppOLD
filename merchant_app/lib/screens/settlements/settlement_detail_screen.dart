import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/services/api_service.dart';
import '../../core/models/settlement_model.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class SettlementDetailScreen extends StatefulWidget {
  final String settlementRef;
  const SettlementDetailScreen({super.key, required this.settlementRef});
  @override
  State<SettlementDetailScreen> createState() => _SettlementDetailScreenState();
}

class _SettlementDetailScreenState extends State<SettlementDetailScreen> {
  SettlementModel? _s;
  List<dynamic> _transactions = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiService.get('/settlement/${widget.settlementRef}');
      final data = res['data'] as Map<String, dynamic>;
      _s = SettlementModel.fromJson(data);
      _transactions = data['transactions'] as List? ?? [];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load settlement';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(title: const Text('Settlement Details')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? EmptyState(
              icon: Icons.error_outline,
              title: 'Error',
              subtitle: _error,
              onAction: _load,
              actionLabel: 'Retry',
            )
          : _buildBody(),
    );
  }

  Widget _buildBody() {
    final s = _s!;
    final isSuccess = s.status == 'success';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Header
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isSuccess
                    ? [const Color(0xFF22C55E), const Color(0xFF16A34A)]
                    : [AppTheme.info, const Color(0xFF2563EB)],
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                Icon(
                  isSuccess ? Icons.check_circle : Icons.hourglass_empty,
                  color: Colors.white,
                  size: 44,
                ),
                const SizedBox(height: 8),
                Text(
                  formatCurrency(s.netAmount),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Settled to your bank account',
                  style: const TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Breakdown
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Breakdown',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  const SizedBox(height: 12),
                  InfoRow(
                    label: 'Gross Amount',
                    value: formatCurrency(s.grossAmount),
                  ),
                  InfoRow(
                    label: 'Net Amount',
                    value: formatCurrency(s.netAmount),
                  ),
                  InfoRow(
                    label: 'Transactions',
                    value: '${s.transactionCount}',
                  ),
                  InfoRow(label: 'Type', value: s.type.toUpperCase()),
                  InfoRow(label: 'Status', value: s.status.toUpperCase()),
                  InfoRow(
                    label: 'Initiated',
                    value: formatDateTime(s.createdAt),
                  ),
                  if (s.completedAt != null)
                    InfoRow(
                      label: 'Completed',
                      value: formatDateTime(s.completedAt!),
                      isLast: true,
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Bank details
          if (s.bankAccountNumber != null || s.bankName != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.account_balance,
                          size: 18,
                          color: AppTheme.primary,
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'Bank Account',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (s.bankName != null)
                      InfoRow(label: 'Bank', value: s.bankName!),
                    if (s.bankAccountNumber != null)
                      InfoRow(label: 'Account', value: s.bankAccountNumber!),
                    if (s.payoutMode != null)
                      InfoRow(label: 'Mode', value: s.payoutMode!),
                    if (s.payoutReferenceId != null)
                      _CopyRef(label: 'UTR / Ref', value: s.payoutReferenceId!),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 12),

          // Transactions in this settlement
          if (_transactions.isNotEmpty) ...[
            SectionHeader(
              title: 'Included Transactions (${_transactions.length})',
            ),
            const SizedBox(height: 8),
            ..._transactions.map((tx) => _TxMini(tx: tx)),
          ],
        ],
      ),
    );
  }
}

class _CopyRef extends StatelessWidget {
  final String label;
  final String value;
  const _CopyRef({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          SizedBox(
            width: 130,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          GestureDetector(
            onTap: () {
              Clipboard.setData(ClipboardData(text: value));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Copied'),
                  duration: Duration(seconds: 2),
                ),
              );
            },
            child: const Icon(
              Icons.copy,
              size: 16,
              color: AppTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _TxMini extends StatelessWidget {
  final dynamic tx;
  const _TxMini({required this.tx});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        dense: true,
        leading: const Icon(Icons.receipt, size: 18, color: AppTheme.primary),
        title: Text(tx['orderId'] ?? '', style: const TextStyle(fontSize: 12)),
        subtitle: Text(
          tx['customerName'] ?? '',
          style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
        ),
        trailing: Text(
          formatCurrency((tx['amount'] as num?)?.toDouble() ?? 0),
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        ),
        onTap: () => Navigator.pushNamed(
          context,
          '/transaction-detail',
          arguments: tx['orderId'],
        ),
      ),
    );
  }
}
