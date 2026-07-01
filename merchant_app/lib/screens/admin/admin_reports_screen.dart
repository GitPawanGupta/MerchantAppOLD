import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class AdminReportsScreen extends StatefulWidget {
  const AdminReportsScreen({super.key});
  @override
  State<AdminReportsScreen> createState() => _AdminReportsScreenState();
}

class _AdminReportsScreenState extends State<AdminReportsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tab;
  String _period = 'month';
  bool _loading = false;
  String? _error;

  Map<String, dynamic> _txSummary   = {};
  Map<String, dynamic> _commSummary = {};
  Map<String, dynamic> _setlSummary = {};
  List<dynamic> _topMerchants = [];

  static const _periods = [
    ('today', 'Today'), ('week', 'Week'),
    ('month', '30 Days'), ('quarter', '90 Days'),
  ];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 3, vsync: this);
    _load();
  }

  @override
  void dispose() { _tab.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        ApiService.get('/admin/reports/transactions?period=$_period'),
        ApiService.get('/admin/reports/commissions?period=$_period'),
        ApiService.get('/admin/reports/settlements?period=$_period'),
      ]);
      _txSummary   = (results[0]['data'] as Map<String, dynamic>?)?['summary'] as Map<String, dynamic>? ?? {};
      _commSummary = (results[1]['data'] as Map<String, dynamic>?)?['summary'] as Map<String, dynamic>? ?? {};
      _setlSummary = (results[2]['data'] as Map<String, dynamic>?)?['summary'] as Map<String, dynamic>? ?? {};
      _topMerchants = (results[1]['data'] as Map<String, dynamic>?)?['byMerchant'] as List? ?? [];
    } on ApiException catch (e) { _error = e.message; }
    catch (_) { _error = 'Failed to load reports'; }
    finally { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Platform Reports'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
        bottom: TabBar(
          controller: _tab,
          labelColor: AppTheme.primary,
          unselectedLabelColor: AppTheme.textSecondary,
          indicatorColor: AppTheme.primary,
          tabs: const [
            Tab(text: 'Transactions'),
            Tab(text: 'Commission'),
            Tab(text: 'Settlements'),
          ],
        ),
      ),
      body: Column(children: [
        // Period selector
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(children: _periods.map((p) => Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(p.$2),
              selected: _period == p.$1,
              selectedColor: AppTheme.primary.withValues(alpha: 0.15),
              labelStyle: TextStyle(
                  fontSize: 12,
                  color: _period == p.$1 ? AppTheme.primary : AppTheme.textSecondary,
                  fontWeight: _period == p.$1 ? FontWeight.w700 : FontWeight.normal),
              onSelected: (_) { setState(() => _period = p.$1); _load(); },
            ),
          )).toList()),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? EmptyState(icon: Icons.wifi_off, title: 'Error', subtitle: _error,
                      onAction: _load, actionLabel: 'Retry')
                  : TabBarView(
                      controller: _tab,
                      children: [
                        _ReportTab(title: 'Transaction Report', items: [
                          _ReportRow('Total Payments', '${_txSummary['count'] ?? 0}'),
                          _ReportRow('Total Volume', formatCurrency((_txSummary['totalVolume'] as num?)?.toDouble() ?? 0)),
                          _ReportRow('Total Settled', formatCurrency((_txSummary['totalSettled'] as num?)?.toDouble() ?? 0)),
                        ]),
                        _CommissionTab(summary: _commSummary, topMerchants: _topMerchants),
                        _ReportTab(title: 'Settlement Report', items: [
                          _ReportRow('Total Settlements', '${_setlSummary['count'] ?? 0}'),
                          _ReportRow('Gross Amount', formatCurrency((_setlSummary['totalGross'] as num?)?.toDouble() ?? 0)),
                          _ReportRow('Commission Earned', formatCurrency((_setlSummary['totalCommission'] as num?)?.toDouble() ?? 0), highlight: true),
                          _ReportRow('Net Settled', formatCurrency((_setlSummary['totalNet'] as num?)?.toDouble() ?? 0)),
                        ]),
                      ],
                    ),
        ),
      ]),
    );
  }
}

class _ReportTab extends StatelessWidget {
  final String title;
  final List<_ReportRow> items;
  const _ReportTab({required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 12),
              ...items.asMap().entries.map((e) => Column(children: [
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(e.value.label,
                          style: const TextStyle(
                              fontSize: 13, color: AppTheme.textSecondary)),
                      Text(e.value.value,
                          style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: e.value.highlight
                                  ? AppTheme.accent
                                  : AppTheme.textPrimary)),
                    ],
                  ),
                ),
                if (e.key < items.length - 1) const Divider(height: 1),
              ])),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReportRow {
  final String label, value;
  final bool highlight;
  const _ReportRow(this.label, this.value, {this.highlight = false});
}

class _CommissionTab extends StatelessWidget {
  final Map<String, dynamic> summary;
  final List<dynamic> topMerchants;
  const _CommissionTab({required this.summary, required this.topMerchants});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Commission Summary',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 12),
                // Highlight commission earned
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                        colors: [Color(0xFF22C55E), Color(0xFF16A34A)]),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(children: [
                    const Text('Total Commission Earned',
                        style: TextStyle(color: Colors.white70, fontSize: 13)),
                    const SizedBox(height: 4),
                    Text(
                        formatCurrency(
                            (summary['totalCommission'] as num?)?.toDouble() ?? 0),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 28,
                            fontWeight: FontWeight.w800)),
                  ]),
                ),
                const SizedBox(height: 12),
                InfoRow(label: 'Total Transactions',
                    value: '${summary['totalTransactions'] ?? 0}'),
                InfoRow(label: 'Total Volume',
                    value: formatCurrency(
                        (summary['totalVolume'] as num?)?.toDouble() ?? 0)),
                InfoRow(label: 'Avg Commission Rate',
                    value: '${((summary['avgRate'] as num?)?.toDouble() ?? 0).toStringAsFixed(2)}%',
                    isLast: true),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (topMerchants.isNotEmpty) ...[
          const SectionHeader(title: 'Commission by Merchant'),
          const SizedBox(height: 8),
          ...topMerchants.map((m) => Card(
            margin: const EdgeInsets.only(bottom: 6),
            child: ListTile(
              leading: const Icon(Icons.store_outlined,
                  color: AppTheme.primary, size: 20),
              title: Text(m['businessName'] ?? '',
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600)),
              subtitle: Text('${m['transactionCount']} txns • '
                  '${((m['avgRate'] as num?)?.toDouble() ?? 0).toStringAsFixed(1)}% avg rate',
                  style: const TextStyle(
                      fontSize: 11, color: AppTheme.textSecondary)),
              trailing: Text(
                  formatCurrency(
                      (m['commission'] as num?)?.toDouble() ?? 0),
                  style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: AppTheme.accent)),
            ),
          )),
        ],
      ]),
    );
  }
}
