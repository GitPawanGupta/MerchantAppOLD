import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/models/settlement_model.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/constants/app_constants.dart';

class SettlementListScreen extends StatefulWidget {
  const SettlementListScreen({super.key});
  @override
  State<SettlementListScreen> createState() => _SettlementListScreenState();
}

class _SettlementListScreenState extends State<SettlementListScreen> {
  final List<SettlementModel> _items = [];
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
      final q = StringBuffer('/settlement?page=$_page&limit=15');
      if (_statusFilter.isNotEmpty) q.write('&status=$_statusFilter');
      final res = await ApiService.get(q.toString());
      final list = (res['data'] as List)
          .map((e) => SettlementModel.fromJson(e))
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
      setState(() => _error = 'Failed to load settlements');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(title: const Text('Settlements')),
      body: Column(
        children: [
          // Status filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: ['', 'success', 'processing', 'pending', 'failed']
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
                            icon: Icons.account_balance_outlined,
                            title: 'No settlements yet',
                            subtitle:
                                'Settlements will appear after successful payments',
                          )
                  : ListView.separated(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
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
                        return _SettlementCard(s: _items[i]);
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SettlementCard extends StatelessWidget {
  final SettlementModel s;
  const _SettlementCard({required this.s});

  @override
  Widget build(BuildContext context) {
    final statusColor = Color(
      AppConstants.settlementStatusColor[s.status] ?? 0xFF94A3B8,
    );
    return BorderedCard(
      borderColor: statusColor,
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.pushNamed(
          context,
          '/settlement-detail',
          arguments: s.settlementRef,
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.settlementRef,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          formatCurrency(s.netAmount),
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  StatusChip(
                    status: s.status,
                    colorMap: AppConstants.settlementStatusColor,
                  ),
                ],
              ),
              const Divider(height: 20, color: Color(0xFFF1F5F9)),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _Stat(label: 'Gross', value: formatCurrency(s.grossAmount)),
                  _Stat(
                    label: '${s.transactionCount} txn',
                    value: s.type.toUpperCase(),
                    color: AppTheme.primary,
                  ),
                ],
              ),
              const Divider(height: 16, color: Color(0xFFF1F5F9)),
              Row(
                children: [
                  Icon(
                    s.completedAt != null ? Icons.check_circle_rounded : Icons.schedule_rounded,
                    size: 14,
                    color: s.completedAt != null ? AppTheme.accent : statusColor,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    s.completedAt != null
                        ? 'Completed ${formatDateTime(s.completedAt!)}'
                        : 'Created ${formatDateTime(s.createdAt)}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;
  const _Stat({required this.label, required this.value, this.color});
  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text(
        value,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: color ?? AppTheme.textPrimary,
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
