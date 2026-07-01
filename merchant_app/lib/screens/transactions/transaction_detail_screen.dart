import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/services/api_service.dart';
import '../../core/models/transaction_model.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/constants/app_constants.dart';

class TransactionDetailScreen extends StatefulWidget {
  final String orderId;
  const TransactionDetailScreen({super.key, required this.orderId});
  @override
  State<TransactionDetailScreen> createState() => _TransactionDetailScreenState();
}

class _TransactionDetailScreenState extends State<TransactionDetailScreen> {
  TransactionModel? _tx;
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiService.get('/payment/transactions/${widget.orderId}');
      _tx = TransactionModel.fromJson(res['data']);
    } on ApiException catch (e) { _error = e.message; }
    catch (_) { _error = 'Failed to load transaction'; }
    finally { if (mounted) setState(() => _loading = false); }
  }

  void _copyToClipboard(String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$label copied'), duration: const Duration(seconds: 2)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(title: const Text('Payment Details')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? EmptyState(
                  icon: Icons.error_outline,
                  title: 'Error',
                  subtitle: _error,
                  onAction: _load,
                  actionLabel: 'Retry')
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: _buildBody(),
                ),
    );
  }

  Widget _buildBody() {
    final tx = _tx!;
    return Column(
      children: [
        // ── Amount header ─────────────────────────────────────────────
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: tx.status == 'success'
                  ? [const Color(0xFF22C55E), const Color(0xFF16A34A)]
                  : tx.status == 'failed'
                      ? [AppTheme.error, const Color(0xFFDC2626)]
                      : [AppTheme.warning, const Color(0xFFD97706)],
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            children: [
              Icon(
                tx.status == 'success'
                    ? Icons.check_circle
                    : tx.status == 'failed'
                        ? Icons.cancel
                        : Icons.pending,
                color: Colors.white,
                size: 48,
              ),
              const SizedBox(height: 8),
              Text(
                formatCurrency(tx.amount),
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              Text(
                tx.status.toUpperCase(),
                style: const TextStyle(
                    color: Colors.white70, fontSize: 14, letterSpacing: 1),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // ── Breakdown card ────────────────────────────────────────────


        // ── Transaction info ──────────────────────────────────────────
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Transaction Info',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 12),
                _CopyableRow(
                  label: 'Order ID',
                  value: tx.orderId,
                  onCopy: () => _copyToClipboard(tx.orderId, 'Order ID'),
                ),
                if (tx.cfPaymentId != null)
                  _CopyableRow(
                    label: 'Payment ID',
                    value: tx.cfPaymentId!,
                    onCopy: () => _copyToClipboard(tx.cfPaymentId!, 'Payment ID'),
                  ),
                if (tx.cfReferenceId != null)
                  _CopyableRow(
                    label: 'Bank Reference',
                    value: tx.cfReferenceId!,
                    onCopy: () => _copyToClipboard(tx.cfReferenceId!, 'Bank Reference'),
                  ),
                InfoRow(
                    label: 'Payment Method',
                    value: AppConstants.paymentMethodLabels[tx.paymentMethod] ?? tx.paymentMethod),
                InfoRow(
                    label: 'Settlement Status',
                    value: tx.isSettled ? 'Settled' : 'Pending Settlement'),
                if (tx.customerName != null)
                  InfoRow(label: 'Customer', value: tx.customerName!),
                if (tx.customerPhone != null)
                  InfoRow(label: 'Phone', value: tx.customerPhone!),
                InfoRow(label: 'Date', value: formatDateTime(tx.createdAt), isLast: true),
              ],
            ),
          ),
        ),
      ],
    );
  }
}



class _CopyableRow extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback onCopy;
  const _CopyableRow({required this.label, required this.value, required this.onCopy});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        children: [
          Row(
            children: [
              SizedBox(
                width: 130,
                child: Text(label,
                    style: const TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
              ),
              Expanded(
                child: Text(value,
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textPrimary),
                    overflow: TextOverflow.ellipsis),
              ),
              GestureDetector(
                  onTap: onCopy,
                  child: const Icon(Icons.copy, size: 16, color: AppTheme.textSecondary)),
            ],
          ),
          const Divider(height: 1),
        ],
      ),
    );
  }
}
