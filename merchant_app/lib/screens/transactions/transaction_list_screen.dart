import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/models/transaction_model.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/shimmer_widgets.dart';
import '../../core/constants/app_constants.dart';

class TransactionListScreen extends StatefulWidget {
  const TransactionListScreen({super.key});
  @override
  State<TransactionListScreen> createState() => _TransactionListScreenState();
}

class _TransactionListScreenState extends State<TransactionListScreen> {
  final List<TransactionModel> _items = [];
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  int _page = 1;
  bool _loading = false;
  bool _hasMore = true;
  String? _error;
  String _statusFilter = '';
  final _scroll = ScrollController();

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
    _searchController.dispose();
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
      final q = StringBuffer('/payment/transactions?page=$_page&limit=15');
      if (_statusFilter.isNotEmpty) q.write('&status=$_statusFilter');
      final res = await ApiService.get(q.toString());
      final list = (res['data'] as List)
          .map((e) => TransactionModel.fromJson(e))
          .toList();
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
      setState(() => _error = 'Failed to load transactions');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<TransactionModel> get _filteredItems {
    if (_searchQuery.isEmpty) return _items;
    return _items.where((tx) {
      final name = (tx.customerName ?? '').toLowerCase();
      final orderId = tx.orderId.toLowerCase();
      final amount = tx.amount.toString();
      return name.contains(_searchQuery) ||
          orderId.contains(_searchQuery) ||
          amount.contains(_searchQuery);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Payments'),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterSheet,
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Search Bar ────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: TextField(
              controller: _searchController,
              onChanged: (val) {
                setState(() {
                  _searchQuery = val.trim().toLowerCase();
                });
              },
              style: const TextStyle(color: Color(0xFF0F172A), fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Search customer, order ID, amount...',
                prefixIcon: const Icon(
                  Icons.search,
                  color: AppTheme.textSecondary,
                  size: 20,
                ),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(
                          Icons.clear_rounded,
                          size: 18,
                          color: AppTheme.textSecondary,
                        ),
                        onPressed: () {
                          _searchController.clear();
                          setState(() {
                            _searchQuery = '';
                          });
                        },
                      )
                    : null,
                filled: true,
                fillColor: AppTheme.surface,
                contentPadding: const EdgeInsets.symmetric(
                  vertical: 12,
                  horizontal: 16,
                ),
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
                  borderSide: const BorderSide(
                    color: AppTheme.primary,
                    width: 1.5,
                  ),
                ),
              ),
            ),
          ),
          // ── Filter chips ──────────────────────────────────────────
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: ['', 'success', 'pending', 'failed', 'cancelled']
                  .map(
                    (s) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(
                          s.isEmpty
                              ? 'All'
                              : s[0].toUpperCase() + s.substring(1),
                        ),
                        selected: _statusFilter == s,
                        selectedColor: AppTheme.primary.withValues(alpha: 0.15),
                        labelStyle: TextStyle(
                          color: _statusFilter == s
                              ? AppTheme.primary
                              : AppTheme.textSecondary,
                          fontSize: 12,
                          fontWeight: _statusFilter == s
                              ? FontWeight.w700
                              : FontWeight.normal,
                        ),
                        onSelected: (_) {
                          setState(() => _statusFilter = s);
                          _fetch(reset: true);
                        },
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          // ── List ──────────────────────────────────────────────────
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _fetch(reset: true),
              child: _loading && _items.isEmpty
                  ? const ListShimmer(
                      itemShimmer: TransactionShimmer(),
                      itemCount: 8,
                    )
                  : _filteredItems.isEmpty && !_loading
                  ? _error != null
                        ? EmptyState(
                            icon: Icons.wifi_off,
                            title: 'Could not load',
                            subtitle: _error,
                            onAction: () => _fetch(reset: true),
                            actionLabel: 'Retry',
                          )
                        : EmptyState(
                            icon: _searchQuery.isNotEmpty
                                ? Icons.search_off_rounded
                                : Icons.receipt_long_outlined,
                            title: _searchQuery.isNotEmpty
                                ? 'No results found'
                                : 'No transactions yet',
                            subtitle: _searchQuery.isNotEmpty
                                ? 'Try searching something else'
                                : 'Payments will appear here',
                          )
                  : ListView.separated(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      itemCount: _filteredItems.length + (_hasMore ? 1 : 0),
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        if (i == _filteredItems.length) {
                          return const Center(
                            child: Padding(
                              padding: EdgeInsets.all(16),
                              child: CircularProgressIndicator(),
                            ),
                          );
                        }
                        return _TxCard(tx: _filteredItems[i]);
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }

  void _showFilterSheet() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Filter by Status',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: ['', 'success', 'pending', 'failed', 'cancelled']
                  .map(
                    (s) => ChoiceChip(
                      label: Text(
                        s.isEmpty ? 'All' : s[0].toUpperCase() + s.substring(1),
                      ),
                      selected: _statusFilter == s,
                      onSelected: (_) {
                        setState(() => _statusFilter = s);
                        Navigator.pop(context);
                        _fetch(reset: true);
                      },
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

class _TxCard extends StatelessWidget {
  final TransactionModel tx;
  const _TxCard({required this.tx});

  @override
  Widget build(BuildContext context) {
    final methodIcons = {
      'upi': Icons.qr_code_rounded,
      'card': Icons.credit_card_rounded,
      'netbanking': Icons.account_balance_rounded,
      'wallet': Icons.account_balance_wallet_rounded,
    };

    final colorVal = AppConstants.txStatusColor[tx.status] ?? 0xFF94A3B8;
    final statusColor = Color(colorVal);
    final methodLabel =
        AppConstants.paymentMethodLabels[tx.paymentMethod] ??
        tx.paymentMethod.toUpperCase();

    return BorderedCard(
      borderColor: statusColor,
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.pushNamed(
          context,
          '/transaction-detail',
          arguments: tx.orderId,
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      methodIcons[tx.paymentMethod] ??
                          Icons.receipt_long_rounded,
                      color: statusColor,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                tx.customerName?.isNotEmpty == true
                                    ? tx.customerName!
                                    : 'Customer',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: AppTheme.textPrimary,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AppTheme.bgLight,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                methodLabel,
                                style: const TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.textSecondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          formatDateTime(tx.createdAt),
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
                          fontSize: 15,
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
              if (tx.status == 'success') ...[
                const Divider(height: 20, color: Color(0xFFF1F5F9)),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _Mini(
                      label: 'Settled Status',
                      value: tx.isSettled ? 'Settled' : 'Pending',
                      color: tx.isSettled ? AppTheme.accent : AppTheme.warning,
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Mini extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _Mini({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary),
        ),
      ],
    );
  }
}
