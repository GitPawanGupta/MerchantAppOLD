import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});
  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tab;
  String _period = 'month';
  bool _loading = false;
  String? _error;

  // Tx report
  Map<String, dynamic> _txSummary = {};
  List<dynamic> _txDaily = [];
  List<dynamic> _txByMethod = [];

  // Settlement report
  Map<String, dynamic> _setlSummary = {};
  List<dynamic> _setlByStatus = [];

  static const _periods = [
    ('today', 'Today'), ('week', 'Week'),
    ('month', '30 Days'), ('quarter', '90 Days'),
  ];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() { _tab.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        ApiService.get('/reports/transactions?period=$_period'),
        ApiService.get('/reports/settlements?period=$_period'),
      ]);

      final txData   = results[0]['data'] as Map<String, dynamic>;
      final setlData = results[1]['data'] as Map<String, dynamic>;

      _txSummary   = txData['summary']        as Map<String, dynamic>? ?? {};
      _txDaily     = txData['dailyBreakdown']  as List? ?? [];
      _txByMethod  = txData['byPaymentMethod'] as List? ?? [];
      _setlSummary = setlData['summary']       as Map<String, dynamic>? ?? {};
      _setlByStatus = setlData['byStatus']     as List? ?? [];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load reports';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Reports'),
        bottom: TabBar(
          controller: _tab,
          labelColor: AppTheme.primary,
          unselectedLabelColor: AppTheme.textSecondary,
          indicatorColor: AppTheme.primary,
          tabs: const [Tab(text: 'Transactions'), Tab(text: 'Settlements')],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: Column(
        children: [
          // ── Period selector ──────────────────────────────────────
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: _periods.map((p) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(p.$2),
                  selected: _period == p.$1,
                  selectedColor: AppTheme.primary.withValues(alpha: 0.15),
                  labelStyle: TextStyle(
                      color: _period == p.$1
                          ? AppTheme.primary
                          : AppTheme.textSecondary,
                      fontSize: 12,
                      fontWeight: _period == p.$1
                          ? FontWeight.w700
                          : FontWeight.normal),
                  onSelected: (_) {
                    setState(() => _period = p.$1);
                    _load();
                  },
                ),
              )).toList(),
            ),
          ),

          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? EmptyState(
                        icon: Icons.wifi_off,
                        title: 'Failed to load',
                        subtitle: _error,
                        onAction: _load,
                        actionLabel: 'Retry',
                      )
                    : TabBarView(
                        controller: _tab,
                        children: [
                          _TxReport(
                              summary: _txSummary,
                              daily: _txDaily,
                              byMethod: _txByMethod),
                          _SetlReport(
                              summary: _setlSummary,
                              byStatus: _setlByStatus),
                        ],
                      ),
          ),
        ],
      ),
    );
  }
}

// ── Transaction Report Tab ─────────────────────────────────────────────────
class _TxReport extends StatelessWidget {
  final Map<String, dynamic> summary;
  final List<dynamic> daily;
  final List<dynamic> byMethod;
  const _TxReport(
      {required this.summary, required this.daily, required this.byMethod});

  @override
  Widget build(BuildContext context) {
    final count   = summary['count'] ?? 0;
    final volume  = (summary['totalAmount'] as num?)?.toDouble() ?? 0;
    final settled = (summary['totalSettlement'] as num?)?.toDouble() ?? 0;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Summary cards
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _SummaryCard(
                    label: 'Transactions', value: '$count',
                    icon: Icons.receipt_long, color: AppTheme.primary)),
                const SizedBox(width: 12),
                Expanded(child: _SummaryCard(
                    label: 'Volume', value: formatCurrency(volume),
                    icon: Icons.trending_up, color: AppTheme.accent)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _SummaryCard(
              label: 'Net Settled', value: formatCurrency(settled),
              icon: Icons.account_balance, color: AppTheme.info),
          const SizedBox(height: 20),

          // Daily chart
          if (daily.isNotEmpty) ...[
            const Text('Daily Volume',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 12),
            SizedBox(
              height: 180,
              child: _DailyBarChart(daily: daily),
            ),
            const SizedBox(height: 20),
          ],

          // By payment method
          if (byMethod.isNotEmpty) ...[
            const Text('By Payment Method',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 8),
            ...byMethod.map((m) => _MethodRow(method: m)),
          ],
        ],
      ),
    );
  }
}

// ── Settlement Report Tab ─────────────────────────────────────────────────
class _SetlReport extends StatelessWidget {
  final Map<String, dynamic> summary;
  final List<dynamic> byStatus;
  const _SetlReport({required this.summary, required this.byStatus});

  @override
  Widget build(BuildContext context) {
    final count = summary['count'] ?? 0;
    final gross = (summary['totalGross'] as num?)?.toDouble() ?? 0;
    final net   = (summary['totalNet'] as num?)?.toDouble() ?? 0;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _SummaryCard(
                    label: 'Settlements', value: '$count',
                    icon: Icons.swap_horiz, color: AppTheme.primary)),
                const SizedBox(width: 12),
                Expanded(child: _SummaryCard(
                    label: 'Gross', value: formatCurrency(gross),
                    icon: Icons.trending_up, color: AppTheme.accent)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _SummaryCard(
              label: 'Net Received', value: formatCurrency(net),
              icon: Icons.account_balance, color: AppTheme.info),
          const SizedBox(height: 20),

          if (byStatus.isNotEmpty) ...[
            const Text('By Status',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 8),
            ...byStatus.map((s) {
              final statusColors = const {
                'success': AppTheme.accent, 'processing': AppTheme.info,
                'pending': AppTheme.warning, 'failed': AppTheme.error,
              };
              final status = s['_id'] as String? ?? '';
              final color  = statusColors[status] ?? AppTheme.textSecondary;
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: Container(
                    width: 12, height: 12,
                    decoration: BoxDecoration(
                        color: color, shape: BoxShape.circle),
                  ),
                  title: Text(status.toUpperCase(),
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600)),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('${s['count']} settlements',
                          style: const TextStyle(
                              fontSize: 12, color: AppTheme.textSecondary)),
                      Text(formatCurrency(
                              (s['amount'] as num?)?.toDouble() ?? 0),
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: color)),
                    ],
                  ),
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}

// ── Shared widgets ─────────────────────────────────────────────────────────
class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _SummaryCard(
      {required this.label, required this.value,
       required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                style: TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w800, color: color)),
          ),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(
                  fontSize: 11, color: AppTheme.textSecondary),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _MethodRow extends StatelessWidget {
  final dynamic method;
  const _MethodRow({required this.method});

  @override
  Widget build(BuildContext context) {
    const icons = {
      'upi': Icons.payment, 'card': Icons.credit_card,
      'netbanking': Icons.account_balance, 'wallet': Icons.wallet,
      'emi': Icons.calendar_month, 'unknown': Icons.more_horiz,
    };
    final name   = method['_id'] as String? ?? 'unknown';
    final amount = (method['amount'] as num?)?.toDouble() ?? 0;
    final cnt    = method['count'] ?? 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icons[name] ?? Icons.payment,
            color: AppTheme.primary, size: 20),
        title: Text(name.toUpperCase(),
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w600)),
        subtitle: Text('$cnt transactions',
            style: const TextStyle(
                fontSize: 11, color: AppTheme.textSecondary)),
        trailing: Text(formatCurrency(amount),
            style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 14,
                color: AppTheme.textPrimary)),
      ),
    );
  }
}

class _DailyBarChart extends StatelessWidget {
  final List<dynamic> daily;
  const _DailyBarChart({required this.daily});

  @override
  Widget build(BuildContext context) {
    if (daily.isEmpty) return const SizedBox.shrink();

    final spots = daily.asMap().entries.map((e) {
      final v = (e.value['volume'] as num?)?.toDouble() ?? 0;
      return BarChartGroupData(
        x: e.key,
        barRods: [
          BarChartRodData(
            toY: v,
            color: AppTheme.primary,
            width: 8,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
          ),
        ],
      );
    }).toList();

    final maxY = daily.fold<double>(
        0,
        (prev, e) =>
            (((e['volume'] as num?)?.toDouble() ?? 0) > prev)
                ? ((e['volume'] as num?)?.toDouble() ?? 0)
                : prev);

    return BarChart(
      BarChartData(
        barGroups: spots,
        maxY: maxY * 1.2,
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          leftTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false)),
          topTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 22,
              getTitlesWidget: (value, _) {
                final i = value.toInt();
                if (i >= daily.length || i % 5 != 0) {
                  return const SizedBox.shrink();
                }
                final raw = daily[i]['date'];
                if (raw == null) return const SizedBox.shrink();
                final dt = DateTime.tryParse(raw.toString());
                if (dt == null) return const SizedBox.shrink();
                return Text(DateFormat('dd/M').format(dt),
                    style: const TextStyle(
                        fontSize: 9, color: AppTheme.textSecondary));
              },
            ),
          ),
        ),
      ),
    );
  }
}
