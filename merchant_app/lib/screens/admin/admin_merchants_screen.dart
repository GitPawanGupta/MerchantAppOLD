import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/constants/app_constants.dart';

class AdminMerchantsScreen extends StatefulWidget {
  const AdminMerchantsScreen({super.key});
  @override
  State<AdminMerchantsScreen> createState() => _AdminMerchantsScreenState();
}

class _AdminMerchantsScreenState extends State<AdminMerchantsScreen> {
  final List<dynamic> _items = [];
  int _page = 1;
  bool _loading = false;
  bool _hasMore = true;
  String? _error;
  String _statusFilter = '';
  String _kycFilter = '';
  final _scroll = ScrollController();
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetch();
    _scroll.addListener(() {
      if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 200) {
        if (!_loading && _hasMore) _fetch();
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetch({bool reset = false}) async {
    if (_loading) return;
    if (reset) {
      _items.clear();
      _page = 1;
      _hasMore = true;
      _error = null;
    }
    if (!_hasMore) return;
    setState(() => _loading = true);
    try {
      final q = StringBuffer('/admin/merchants?page=$_page&limit=15');
      if (_statusFilter.isNotEmpty) q.write('&status=$_statusFilter');
      if (_kycFilter.isNotEmpty) q.write('&kycStatus=$_kycFilter');
      if (_searchCtrl.text.trim().isNotEmpty) {
        q.write('&search=${Uri.encodeComponent(_searchCtrl.text.trim())}');
      }
      final res = await ApiService.get(q.toString());
      final list = res['data'] as List;
      final pagination = res['pagination'] as Map<String, dynamic>;
      setState(() {
        _items.addAll(list);
        _hasMore = pagination['hasNext'] == true;
        _page++;
        _error = null;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Failed to load merchants');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _updateStatus(String merchantId, String status) async {
    try {
      await ApiService.patch('/admin/merchants/$merchantId/status', {
        'status': status,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Merchant status updated to $status')));
      _fetch(reset: true);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppTheme.error));
    }
  }

  Future<void> _updateKYC(String merchantId, String action) async {
    String? reason;
    if (action == 'reject') {
      reason = await showDialog<String>(
        context: context,
        builder: (_) {
          final ctrl = TextEditingController();
          return AlertDialog(
            title: const Text('Rejection Reason'),
            content: TextField(
              controller: ctrl,
              decoration: const InputDecoration(hintText: 'Enter reason for KYC rejection'),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(context, ctrl.text),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.error,
                  foregroundColor: Colors.white,
                  minimumSize: Size.zero,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                ),
                child: const Text('Reject'),
              ),
            ],
          );
        },
      );
      if (reason == null || reason.isEmpty) return;
    }

    try {
      final body = {'action': action};
      if (reason != null) body['rejectionReason'] = reason;
      await ApiService.patch('/admin/merchants/$merchantId/kyc', body);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('KYC ${action}d successfully')));
      _fetch(reset: true);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppTheme.error));
    }
  }

  Future<void> _manualSettle(String merchantId) async {
    try {
      await ApiService.post('/admin/merchants/$merchantId/settle', {});
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Settlement initiated successfully')));
      _fetch(reset: true);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppTheme.error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Merchants'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(64),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search by name or ID...',
                prefixIcon: const Icon(Icons.search, color: AppTheme.textSecondary, size: 20),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded, size: 18, color: AppTheme.textSecondary),
                        onPressed: () {
                          _searchCtrl.clear();
                          _fetch(reset: true);
                        },
                      )
                    : null,
                filled: true,
                fillColor: AppTheme.surface,
                contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade200),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade200),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppTheme.primary, width: 1.5),
                ),
              ),
              onSubmitted: (_) => _fetch(reset: true),
              onChanged: (v) {
                if (v.isEmpty) _fetch(reset: true);
              },
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          // Filters
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                const Text(
                  'Status: ',
                  style: TextStyle(fontSize: 12, color: AppTheme.textSecondary, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 4),
                ...['', 'active', 'pending', 'suspended'].map(
                  (s) => Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text(
                        s.isEmpty ? 'All' : s[0].toUpperCase() + s.substring(1),
                      ),
                      selected: _statusFilter == s,
                      selectedColor: AppTheme.primary.withValues(alpha: 0.15),
                      labelStyle: TextStyle(
                        fontSize: 11,
                        color: _statusFilter == s
                            ? AppTheme.primary
                            : AppTheme.textSecondary,
                        fontWeight: _statusFilter == s ? FontWeight.bold : FontWeight.normal,
                      ),
                      onSelected: (_) {
                        setState(() => _statusFilter = s);
                        _fetch(reset: true);
                      },
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                const Text(
                  'KYC: ',
                  style: TextStyle(fontSize: 12, color: AppTheme.textSecondary, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 4),
                ...['', 'submitted', 'approved', 'rejected'].map(
                  (s) => Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text(
                        s.isEmpty ? 'All' : s[0].toUpperCase() + s.substring(1),
                      ),
                      selected: _kycFilter == s,
                      selectedColor: AppTheme.info.withValues(alpha: 0.15),
                      labelStyle: TextStyle(
                        fontSize: 11,
                        color: _kycFilter == s
                            ? AppTheme.info
                            : AppTheme.textSecondary,
                        fontWeight: _kycFilter == s ? FontWeight.bold : FontWeight.normal,
                      ),
                      onSelected: (_) {
                        setState(() => _kycFilter = s);
                        _fetch(reset: true);
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _fetch(reset: true),
              child: _items.isEmpty && !_loading
                  ? _error != null
                        ? EmptyState(
                            icon: Icons.wifi_off,
                            title: 'Error',
                            subtitle: _error,
                            onAction: () => _fetch(reset: true),
                            actionLabel: 'Retry',
                          )
                        : const EmptyState(
                            icon: Icons.store_outlined,
                            title: 'No merchants found',
                            subtitle: 'Try changing your filters',
                          )
                  : ListView.separated(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                      itemCount: _items.length + (_hasMore ? 1 : 0),
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        if (i == _items.length) {
                          return const Center(
                            child: Padding(
                              padding: EdgeInsets.all(16),
                              child: CircularProgressIndicator(),
                            ),
                          );
                        }
                        final m = _items[i] as Map<String, dynamic>;
                        return _MerchantCard(
                          merchant: m,
                          onStatusChange: (s) =>
                              _updateStatus(m['merchantId'], s),
                          onKycAction: (a) => _updateKYC(m['merchantId'], a),
                          onSettle: () => _manualSettle(m['merchantId']),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MerchantCard extends StatelessWidget {
  final Map<String, dynamic> merchant;
  final Function(String) onStatusChange;
  final Function(String) onKycAction;
  final VoidCallback onSettle;

  const _MerchantCard({
    required this.merchant,
    required this.onStatusChange,
    required this.onKycAction,
    required this.onSettle,
  });

  @override
  Widget build(BuildContext context) {
    final status = merchant['status'] as String? ?? '';
    final kycStatus =
        (merchant['kyc'] as Map?)?['status'] as String? ?? 'pending';
    final userId = merchant['userId'] as Map<String, dynamic>? ?? {};
    final businessName = merchant['businessName'] as String? ?? 'Merchant';
    final firstLetter = businessName.isNotEmpty ? businessName[0].toUpperCase() : 'M';

    final pendingAmt = (merchant['pendingSettlement'] as num?)?.toDouble() ?? 0;
    final collectedAmt = (merchant['totalCollected'] as num?)?.toDouble() ?? 0;
    final settledAmt = (merchant['totalSettled'] as num?)?.toDouble() ?? 0;

    final statusColorVal = {
      'active': 0xFF22C55E,
      'pending': 0xFFF59E0B,
      'suspended': 0xFFEF4444,
      'closed': 0xFF94A3B8,
    }[status] ?? 0xFF94A3B8;
    final statusColor = Color(statusColorVal);

    return BorderedCard(
      borderColor: statusColor,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: AppTheme.primary.withValues(alpha: 0.1),
                child: Text(
                  firstLetter,
                  style: const TextStyle(
                    color: AppTheme.primary,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      businessName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      merchant['merchantId'] ?? '',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    if (userId['email'] != null)
                      Text(
                        userId['email'],
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
                  StatusChip(
                    status: status,
                    colorMap: const {
                      'active': 0xFF22C55E,
                      'pending': 0xFFF59E0B,
                      'suspended': 0xFFEF4444,
                      'closed': 0xFF94A3B8,
                    },
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Text(
                        'KYC: ',
                        style: TextStyle(fontSize: 10, color: AppTheme.textSecondary),
                      ),
                      StatusChip(
                        status: kycStatus,
                        colorMap: AppConstants.kycStatusColor,
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          const Divider(height: 20, color: Color(0xFFF1F5F9)),
          // Merchant Stats Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _StatMini(
                label: 'Pending Settle',
                value: formatCurrency(pendingAmt),
                color: AppTheme.warning,
              ),
              _StatMini(
                label: 'Collected',
                value: formatCurrency(collectedAmt),
                color: AppTheme.textPrimary,
              ),
              _StatMini(
                label: 'Settled',
                value: formatCurrency(settledAmt),
                color: AppTheme.accent,
              ),
            ],
          ),
          const Divider(height: 20, color: Color(0xFFF1F5F9)),
          // Action Buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              // Show quick action buttons directly on the card if KYC is submitted/under_review
              if (kycStatus == 'submitted' || kycStatus == 'under_review') ...[
                OutlinedButton.icon(
                  onPressed: () => onKycAction('reject'),
                  icon: const Icon(Icons.close, size: 14, color: AppTheme.error),
                  label: const Text('Reject KYC', style: TextStyle(color: AppTheme.error, fontSize: 12)),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppTheme.error),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                    minimumSize: const Size(0, 32),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton.icon(
                  onPressed: () => onKycAction('approve'),
                  icon: const Icon(Icons.check, size: 14),
                  label: const Text('Approve KYC', style: TextStyle(fontSize: 12)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.accent,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                    minimumSize: const Size(0, 32),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_horiz, size: 20),
                style: IconButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(36, 36),
                ),
                itemBuilder: (_) => [
                  if (status != 'active')
                    const PopupMenuItem(
                      value: 'activate',
                      child: Text('Activate Merchant'),
                    ),
                  if (status == 'active')
                    const PopupMenuItem(
                      value: 'suspended',
                      child: Text('Suspend Merchant'),
                    ),
                  if (kycStatus != 'submitted' && kycStatus != 'under_review') ...[
                    const PopupMenuItem(
                      value: 'approve_kyc',
                      child: Text('Approve KYC'),
                    ),
                    const PopupMenuItem(
                      value: 'reject_kyc',
                      child: Text('Reject KYC', style: TextStyle(color: AppTheme.error)),
                    ),
                  ],
                  const PopupMenuItem(
                    value: 'settle',
                    child: Text('Manual Payout'),
                  ),
                ],
                onSelected: (v) {
                  if (v == 'activate') {
                    onStatusChange('active');
                  } else if (v == 'suspended') {
                    onStatusChange('suspended');
                  } else if (v == 'approve_kyc') {
                    onKycAction('approve');
                  } else if (v == 'reject_kyc') {
                    onKycAction('reject');
                  } else if (v == 'settle') {
                    onSettle();
                  }
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatMini extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _StatMini({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 9,
            color: AppTheme.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
