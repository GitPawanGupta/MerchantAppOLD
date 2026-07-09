import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/constants/app_constants.dart';
import 'package:url_launcher/url_launcher.dart';

class AdminSettlementsScreen extends StatefulWidget {
  const AdminSettlementsScreen({super.key});

  @override
  State<AdminSettlementsScreen> createState() => _AdminSettlementsScreenState();
}

class _AdminSettlementsScreenState extends State<AdminSettlementsScreen> {
  List<Map<String, dynamic>> _settlements = [];
  bool _loading = true;
  String _statusFilter = 'all';
  Set<String> _selectedRefs = {};
  bool _bulkMode = false;

  @override
  void initState() {
    super.initState();
    _loadSettlements();
  }

  Future<void> _loadSettlements() async {
    setState(() => _loading = true);
    try {
      final params = _statusFilter != 'all' ? '?status=$_statusFilter' : '';
      final response = await ApiService.get('/admin/settlements$params');
      final data = response['data'] as List;
      setState(() {
        _settlements = data.cast<Map<String, dynamic>>();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load settlements: $e'),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _showTransferDetails(String settlementRef) async {
    try {
      final response = await ApiService.get(
        '/admin/settlements/$settlementRef/transfer-details',
      );
      final details = response['data'] as Map<String, dynamic>;

      if (!mounted) return;

      await showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _TransferDetailsSheet(details: details),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load transfer details: $e'),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    }
  }

  Future<void> _approveSettlement(String settlementRef) async {
    // Show UTR entry dialog
    final utr = await showDialog<String>(
      context: context,
      builder: (_) => _UTREntryDialog(),
    );

    if (utr == null || utr.isEmpty) return;

    try {
      await ApiService.patch(
        '/admin/settlements/$settlementRef/status',
        {
          'status': 'success',
          'payoutReferenceId': utr,
          'payoutMode': 'UPI', // Default, can be made dynamic
        },
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✓ Settlement approved successfully'),
            backgroundColor: Colors.green,
          ),
        );
        _loadSettlements();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to approve: $e'),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    }
  }

  Future<void> _bulkApprove() async {
    if (_selectedRefs.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Bulk Approve Settlements'),
        content: Text(
          'Approve ${_selectedRefs.length} settlements?\n\n'
          'This will mark all selected settlements as completed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
            ),
            child: const Text('Approve All'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ApiService.post('/admin/settlements/bulk-approve', {
        'settlementRefs': _selectedRefs.toList(),
        'payoutMode': 'UPI',
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '✓ ${_selectedRefs.length} settlements approved',
            ),
            backgroundColor: Colors.green,
          ),
        );
        setState(() {
          _selectedRefs.clear();
          _bulkMode = false;
        });
        _loadSettlements();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Bulk approve failed: $e'),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pendingCount = _settlements
        .where((s) => s['status'] == 'pending')
        .length;

    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Settlements'),
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          if (_bulkMode) ...[
            IconButton(
              icon: const Icon(Icons.select_all),
              onPressed: () {
                setState(() {
                  if (_selectedRefs.length == _settlements.length) {
                    _selectedRefs.clear();
                  } else {
                    _selectedRefs = _settlements
                        .map((s) => s['settlementRef'] as String)
                        .toSet();
                  }
                });
              },
              tooltip: 'Select All',
            ),
            IconButton(
              icon: const Icon(Icons.close),
              onPressed: () {
                setState(() {
                  _bulkMode = false;
                  _selectedRefs.clear();
                });
              },
              tooltip: 'Cancel',
            ),
          ] else
            IconButton(
              icon: const Icon(Icons.checklist_rounded),
              onPressed: () => setState(() => _bulkMode = true),
              tooltip: 'Bulk Mode',
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadSettlements,
          ),
        ],
      ),
      body: Column(
        children: [
          // Status Filter Chips
          Container(
            color: AppTheme.surface,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _FilterChip(
                    label: 'All',
                    count: _settlements.length,
                    selected: _statusFilter == 'all',
                    onTap: () {
                      setState(() => _statusFilter = 'all');
                      _loadSettlements();
                    },
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Pending',
                    count: pendingCount,
                    selected: _statusFilter == 'pending',
                    color: AppTheme.warning,
                    onTap: () {
                      setState(() => _statusFilter = 'pending');
                      _loadSettlements();
                    },
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Success',
                    selected: _statusFilter == 'success',
                    color: AppTheme.accent,
                    onTap: () {
                      setState(() => _statusFilter = 'success');
                      _loadSettlements();
                    },
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Failed',
                    selected: _statusFilter == 'failed',
                    color: AppTheme.error,
                    onTap: () {
                      setState(() => _statusFilter = 'failed');
                      _loadSettlements();
                    },
                  ),
                ],
              ),
            ),
          ),

          // Settlements List
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _settlements.isEmpty
                    ? _buildEmptyState()
                    : RefreshIndicator(
                        onRefresh: _loadSettlements,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _settlements.length,
                          itemBuilder: (_, i) {
                            final settlement = _settlements[i];
                            final ref = settlement['settlementRef'] as String;
                            final isSelected = _selectedRefs.contains(ref);

                            return _SettlementCard(
                              settlement: settlement,
                              bulkMode: _bulkMode,
                              isSelected: isSelected,
                              onTap: () {
                                if (_bulkMode) {
                                  setState(() {
                                    if (isSelected) {
                                      _selectedRefs.remove(ref);
                                    } else {
                                      _selectedRefs.add(ref);
                                    }
                                  });
                                } else {
                                  _showTransferDetails(ref);
                                }
                              },
                              onApprove: settlement['status'] == 'pending'
                                  ? () => _approveSettlement(ref)
                                  : null,
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
      floatingActionButton: _bulkMode && _selectedRefs.isNotEmpty
          ? FloatingActionButton.extended(
              onPressed: _bulkApprove,
              backgroundColor: AppTheme.primary,
              icon: const Icon(Icons.check_circle),
              label: Text('Approve ${_selectedRefs.length}'),
            )
          : null,
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.account_balance_outlined,
            size: 64,
            color: AppTheme.textHint,
          ),
          const SizedBox(height: 16),
          Text(
            _statusFilter == 'pending'
                ? 'No pending settlements'
                : 'No settlements found',
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppTheme.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Settlements will appear here once merchants\nrequest withdrawals',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: AppTheme.textHint,
            ),
          ),
        ],
      ),
    );
  }
}

// Filter Chip Widget
class _FilterChip extends StatelessWidget {
  final String label;
  final int? count;
  final bool selected;
  final Color? color;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    this.count,
    required this.selected,
    this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final chipColor = color ?? AppTheme.primary;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? chipColor.withValues(alpha: 0.15)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? chipColor : AppTheme.divider,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? chipColor : AppTheme.textSecondary,
              ),
            ),
            if (count != null) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: selected ? chipColor : AppTheme.textHint,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  count.toString(),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// Settlement Card Widget
class _SettlementCard extends StatelessWidget {
  final Map<String, dynamic> settlement;
  final bool bulkMode;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback? onApprove;

  const _SettlementCard({
    required this.settlement,
    required this.bulkMode,
    required this.isSelected,
    required this.onTap,
    this.onApprove,
  });

  @override
  Widget build(BuildContext context) {
    final status = settlement['status'] as String;
    final statusColor = Color(
      AppConstants.settlementStatusColor[status] ?? 0xFF94A3B8,
    );
    final netAmount = (settlement['netAmount'] as num).toDouble();
    final merchantName = settlement['merchantId']?['businessName'] ?? 'N/A';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isSelected
              ? AppTheme.primary
              : AppTheme.divider,
          width: isSelected ? 2 : 1,
        ),
        boxShadow: AppTheme.softShadow,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (bulkMode)
                      Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: Icon(
                          isSelected
                              ? Icons.check_box
                              : Icons.check_box_outline_blank,
                          color: isSelected
                              ? AppTheme.primary
                              : AppTheme.textHint,
                        ),
                      ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            merchantName,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            settlement['settlementRef'],
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppTheme.textSecondary,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        status.toUpperCase(),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: statusColor,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Amount',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '₹${netAmount.toStringAsFixed(2)}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.primary,
                          ),
                        ),
                      ],
                    ),
                    if (onApprove != null && !bulkMode)
                      ElevatedButton.icon(
                        onPressed: onApprove,
                        icon: const Icon(Icons.check, size: 16),
                        label: const Text('Approve'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
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

// Transfer Details Bottom Sheet
class _TransferDetailsSheet extends StatelessWidget {
  final Map<String, dynamic> details;

  const _TransferDetailsSheet({required this.details});

  @override
  Widget build(BuildContext context) {
    final transferMethods = details['transferMethods'] as Map<String, dynamic>?;
    final upi = transferMethods?['upi'] as Map<String, dynamic>?;
    final phonePe = transferMethods?['phonePe'] as Map<String, dynamic>?;
    final bank = transferMethods?['bank'] as Map<String, dynamic>?;
    final copyText = details['copyText'] as String?;

    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, controller) {
          return ListView(
            controller: controller,
            padding: const EdgeInsets.all(24),
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 20),
                  decoration: BoxDecoration(
                    color: AppTheme.divider,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Title
              const Text(
                'Settlement Transfer Details',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                details['settlementRef'] ?? '',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.textSecondary,
                  fontFamily: 'monospace',
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
                      'Amount to Transfer',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.white70,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      details['formattedAmount'] ?? '₹0.00',
                      style: const TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Quick Transfer Options
              if (upi != null || phonePe != null) ...[
                const Text(
                  'Quick Transfer',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),

                if (upi != null)
                  _QuickPayButton(
                    icon: Icons.qr_code_2,
                    label: 'Pay via UPI',
                    subtitle: upi['vpa'] ?? '',
                    color: Colors.purple,
                    onTap: () async {
                      final url = upi['deepLink'] as String?;
                      if (url != null) {
                        final uri = Uri.parse(url);
                        if (await canLaunchUrl(uri)) {
                          await launchUrl(uri, mode: LaunchMode.externalApplication);
                        }
                      }
                    },
                  ),

                if (phonePe != null)
                  _QuickPayButton(
                    icon: Icons.phone_android,
                    label: 'Pay via PhonePe',
                    subtitle: phonePe['phone'] ?? '',
                    color: const Color(0xFF5F259F),
                    onTap: () async {
                      final url = phonePe['deepLink'] as String?;
                      if (url != null) {
                        final uri = Uri.parse(url);
                        if (await canLaunchUrl(uri)) {
                          await launchUrl(uri, mode: LaunchMode.externalApplication);
                        }
                      }
                    },
                  ),

                const SizedBox(height: 24),
              ],

              // Bank Details
              if (bank != null) ...[
                const Text(
                  'Bank Transfer Details',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                _InfoRow(
                  label: 'Account Holder',
                  value: bank['accountHolderName'] ?? 'N/A',
                ),
                _InfoRow(
                  label: 'Account Number',
                  value: bank['accountNumber'] ?? 'N/A',
                ),
                _InfoRow(
                  label: 'IFSC Code',
                  value: bank['ifscCode'] ?? 'N/A',
                ),
                _InfoRow(
                  label: 'Bank Name',
                  value: bank['bankName'] ?? 'N/A',
                  isLast: true,
                ),
              ],

              const SizedBox(height: 24),

              // Copy All Button
              if (copyText != null)
                OutlinedButton.icon(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: copyText));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('✓ Transfer details copied!'),
                        duration: Duration(seconds: 2),
                      ),
                    );
                  },
                  icon: const Icon(Icons.copy),
                  label: const Text('Copy All Details'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: BorderSide(color: AppTheme.primary),
                  ),
                ),

              const SizedBox(height: 32),
            ],
          );
        },
      ),
    );
  }
}

// Quick Pay Button
class _QuickPayButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _QuickPayButton({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.open_in_new, size: 18, color: color),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// Info Row
class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isLast;

  const _InfoRow({
    required this.label,
    required this.value,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 2,
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.textSecondary,
                ),
              ),
            ),
            Expanded(
              flex: 3,
              child: Text(
                value,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.right,
              ),
            ),
          ],
        ),
        if (!isLast) ...[
          const SizedBox(height: 12),
          Divider(height: 1, color: AppTheme.divider),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}

// UTR Entry Dialog
class _UTREntryDialog extends StatefulWidget {
  @override
  State<_UTREntryDialog> createState() => _UTREntryDialogState();
}

class _UTREntryDialogState extends State<_UTREntryDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Enter UTR/Reference Number'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Enter the bank transaction reference number (UTR) after completing the transfer.',
            style: TextStyle(
              fontSize: 13,
              color: AppTheme.textSecondary,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            decoration: InputDecoration(
              hintText: 'e.g., UTR123456789',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 12,
              ),
            ),
            textCapitalization: TextCapitalization.characters,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () {
            if (_controller.text.trim().isNotEmpty) {
              Navigator.pop(context, _controller.text.trim());
            }
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primary,
          ),
          child: const Text('Confirm'),
        ),
      ],
    );
  }
}
