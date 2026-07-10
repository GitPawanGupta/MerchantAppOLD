import 'package:flutter/material.dart';
import '../../../core/services/api_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/models/bank_account_model.dart';

class SettlementRequestSheet extends StatefulWidget {
  final double pendingAmount;
  final int transactionCount;
  final double commissionAmount;
  final List<BankAccountModel> bankAccounts;

  const SettlementRequestSheet({
    super.key,
    required this.pendingAmount,
    required this.transactionCount,
    required this.commissionAmount,
    required this.bankAccounts,
  });

  @override
  State<SettlementRequestSheet> createState() => _SettlementRequestSheetState();
}

class _SettlementRequestSheetState extends State<SettlementRequestSheet> {
  String? _selectedBankId;
  bool _loading = false;
  bool _agreedToTerms = false;

  Future<void> _requestSettlement() async {
    if (_selectedBankId == null) {
      _showError('Please select a bank account');
      return;
    }

    if (!_agreedToTerms) {
      _showError('Please agree to settlement terms');
      return;
    }

    // Show confirmation dialog
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Confirm Settlement Request'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Are you sure you want to request settlement?',
              style: TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 16),
            _InfoRow(
              label: 'Amount to receive',
              value: '₹${widget.pendingAmount.toStringAsFixed(2)}',
              valueColor: AppTheme.primary,
            ),
            const SizedBox(height: 8),
            _InfoRow(
              label: 'Bank account',
              value: widget.bankAccounts
                  .firstWhere((b) => b.id == _selectedBankId)
                  .accountNumber
                  .replaceRange(0, 4, '****')
                  .replaceRange(8, 12, '****'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _loading = true);
    try {
      await ApiService.post('/settlement/request', {
        'bankAccountId': _selectedBankId,
      });

      if (!mounted) return;

      Navigator.pop(context, true); // Close sheet with success

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✓ Settlement request submitted successfully'),
          backgroundColor: Colors.green,
        ),
      );
    } on ApiException catch (e) {
      if (mounted) _showError(e.message);
    } catch (e) {
      if (mounted) {
        _showError('Failed to request settlement. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppTheme.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: AppTheme.divider,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title
                  const Text(
                    'Request Settlement',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Your funds will be transferred to your selected bank account after admin approval.',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppTheme.textSecondary,
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Amount Card
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.primary, Color(0xFF3b6fd4)],
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        const Text(
                          'Settlement Amount',
                          style: TextStyle(fontSize: 13, color: Colors.white70),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '₹${widget.pendingAmount.toStringAsFixed(2)}',
                          style: const TextStyle(
                            fontSize: 36,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.receipt_long,
                              size: 14,
                              color: Colors.white.withValues(alpha: 0.7),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              '${widget.transactionCount} transactions',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.white.withValues(alpha: 0.7),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Breakdown
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppTheme.bgLight,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.divider),
                    ),
                    child: Column(
                      children: [
                        _InfoRow(
                          label: 'Gross Amount',
                          value:
                              '₹${(widget.pendingAmount + widget.commissionAmount).toStringAsFixed(2)}',
                        ),
                        const SizedBox(height: 8),
                        _InfoRow(
                          label: 'Platform Commission',
                          value:
                              '- ₹${widget.commissionAmount.toStringAsFixed(2)}',
                          valueColor: AppTheme.error,
                        ),
                        const Divider(height: 16),
                        _InfoRow(
                          label: 'Net Settlement',
                          value: '₹${widget.pendingAmount.toStringAsFixed(2)}',
                          valueColor: AppTheme.accent,
                          isBold: true,
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Bank Account Selection
                  const Text(
                    'Select Bank Account',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),

                  if (widget.bankAccounts.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppTheme.warning.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppTheme.warning.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Column(
                        children: [
                          Icon(
                            Icons.account_balance_outlined,
                            size: 40,
                            color: AppTheme.warning,
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'No bank account added',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Please add a bank account to receive settlements',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 12,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextButton.icon(
                            onPressed: () {
                              Navigator.pop(context);
                              Navigator.pushNamed(context, '/bank-accounts');
                            },
                            icon: const Icon(Icons.add, size: 18),
                            label: const Text('Add Bank Account'),
                          ),
                        ],
                      ),
                    )
                  else
                    ...widget.bankAccounts.map((bank) {
                      final isSelected = _selectedBankId == bank.id;
                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppTheme.primary.withValues(alpha: 0.05)
                              : AppTheme.surface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isSelected
                                ? AppTheme.primary
                                : AppTheme.divider,
                            width: isSelected ? 2 : 1,
                          ),
                        ),
                        child: RadioListTile<String>(
                          value: bank.id,
                          // ignore: deprecated_member_use
                          groupValue: _selectedBankId,
                          // ignore: deprecated_member_use
                          onChanged: _loading
                              ? null
                              : (val) => setState(() => _selectedBankId = val),
                          title: Text(
                            bank.bankName,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 4),
                              Text(
                                bank.accountHolderName,
                                style: const TextStyle(fontSize: 12),
                              ),
                              Text(
                                '****${bank.accountNumber.substring(bank.accountNumber.length - 4)}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.textSecondary,
                                  fontFamily: 'monospace',
                                ),
                              ),
                              if (bank.isPrimary)
                                Container(
                                  margin: const EdgeInsets.only(top: 6),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppTheme.accent.withValues(
                                      alpha: 0.15,
                                    ),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    'PRIMARY',
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: AppTheme.accent,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          activeColor: AppTheme.primary,
                        ),
                      );
                    }),

                  if (widget.bankAccounts.isNotEmpty) ...[
                    const SizedBox(height: 20),

                    // Terms checkbox
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Checkbox(
                            value: _agreedToTerms,
                            onChanged: _loading
                                ? null
                                : (val) => setState(
                                    () => _agreedToTerms = val ?? false,
                                  ),
                            activeColor: AppTheme.primary,
                          ),
                          const Expanded(
                            child: Padding(
                              padding: EdgeInsets.only(top: 12, left: 8),
                              child: Text(
                                'I understand that settlement will be processed after admin approval and funds will be transferred to the selected bank account.',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.textSecondary,
                                  height: 1.4,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    // Submit Button
                    SizedBox(
                      width: double.infinity,
                      height: 54,
                      child: ElevatedButton(
                        onPressed: _loading ? null : _requestSettlement,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primary,
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: AppTheme.primary.withValues(
                            alpha: 0.5,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          elevation: 0,
                        ),
                        child: _loading
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : const Text(
                                'Request Settlement',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                      ),
                    ),

                    const SizedBox(height: 12),

                    // Info text
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.bgLight,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppTheme.divider),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.info_outline,
                            size: 16,
                            color: AppTheme.primary,
                          ),
                          const SizedBox(width: 10),
                          const Expanded(
                            child: Text(
                              'Settlement requests are typically processed within 24-48 hours',
                              style: TextStyle(
                                fontSize: 11,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final bool isBold;

  const _InfoRow({
    required this.label,
    required this.value,
    this.valueColor,
    this.isBold = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            color: AppTheme.textSecondary,
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w400,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: isBold ? FontWeight.w800 : FontWeight.w600,
            color: valueColor ?? AppTheme.textPrimary,
          ),
        ),
      ],
    );
  }
}
