import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/constants/app_constants.dart';

class AdminTransactionsScreen extends StatefulWidget {
  const AdminTransactionsScreen({super.key});
  @override
  State<AdminTransactionsScreen> createState() => _AdminTransactionsScreenState();
}

class _AdminTransactionsScreenState extends State<AdminTransactionsScreen> {
  final List<dynamic> _items = [];
  int _page = 1;
  bool _loading = false;
  bool _hasMore = true;
  String? _error;
  String _statusFilter = '';
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
  void dispose() { _scroll.dispose(); _searchCtrl.dispose(); super.dispose(); }

  Future<void> _fetch({bool reset = false}) async {
    if (_loading) return;
    if (reset) { _items.clear(); _page = 1; _hasMore = true; _error = null; }
    if (!_hasMore) return;
    setState(() => _loading = true);
    try {
      final q = StringBuffer('/admin/transactions?page=$_page&limit=20');
      if (_statusFilter.isNotEmpty) q.write('&status=$_statusFilter');
      if (_searchCtrl.text.trim().isNotEmpty) {
        q.write('&merchantId=${Uri.encodeComponent(_searchCtrl.text.trim())}');
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
    } on ApiException catch (e) { setState(() => _error = e.message); }
    catch (_) { setState(() => _error = 'Failed to load transactions'); }
    finally { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('All Transactions'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(50),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search by Merchant ID...',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () { _searchCtrl.clear(); _fetch(reset: true); })
                    : null,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
              ),
              onSubmitted: (_) => _fetch(reset: true),
            ),
          ),
        ),
      ),
      body: Column(children: [
        // Status filter chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(children: ['', 'success', 'pending', 'failed', 'cancelled']
              .map((s) => Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilterChip(
                      label: Text(s.isEmpty ? 'All' : s[0].toUpperCase() + s.substring(1)),
                      selected: _statusFilter == s,
                      selectedColor: AppTheme.primary.withValues(alpha: 0.15),
                      labelStyle: TextStyle(
                          fontSize: 11,
                          color: _statusFilter == s ? AppTheme.primary : AppTheme.textSecondary),
                      onSelected: (_) { setState(() => _statusFilter = s); _fetch(reset: true); },
                    ),
                  ))
              .toList()),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _fetch(reset: true),
            child: _items.isEmpty && !_loading
                ? _error != null
                    ? EmptyState(icon: Icons.wifi_off, title: 'Error', subtitle: _error,
                        onAction: () => _fetch(reset: true), actionLabel: 'Retry')
                    : const EmptyState(icon: Icons.receipt_long_outlined, title: 'No transactions')
                : ListView.separated(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                    itemCount: _items.length + (_hasMore ? 1 : 0),
                    separatorBuilder: (_, _) => const SizedBox(height: 6),
                    itemBuilder: (_, i) {
                      if (i == _items.length) {
                        return const Center(child: Padding(
                            padding: EdgeInsets.all(16),
                            child: CircularProgressIndicator()));
                      }
                      final tx = _items[i] as Map<String, dynamic>;
                      final merchant = tx['merchantId'] as Map<String, dynamic>? ?? {};
                      return Card(
                        child: ListTile(
                          dense: true,
                          leading: StatusChip(
                              status: tx['status'] ?? 'pending',
                              colorMap: AppConstants.txStatusColor),
                          title: Text(tx['orderId'] ?? '',
                              style: const TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w600)),
                          subtitle: Text(
                              '${merchant['businessName'] ?? ''} • ${tx['paymentMethod'] ?? ''}',
                              style: const TextStyle(
                                  fontSize: 11, color: AppTheme.textSecondary)),
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                  formatCurrency(
                                      (tx['amount'] as num?)?.toDouble() ?? 0),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700, fontSize: 13)),
                              Text(
                                  formatDate(DateTime.tryParse(
                                          tx['createdAt'] ?? '') ??
                                      DateTime.now()),
                                  style: const TextStyle(
                                      fontSize: 10, color: AppTheme.textSecondary)),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ),
      ]),
    );
  }
}
