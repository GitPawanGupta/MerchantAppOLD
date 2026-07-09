import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class AdminCommissionScreen extends StatefulWidget {
  const AdminCommissionScreen({super.key});
  @override
  State<AdminCommissionScreen> createState() => _AdminCommissionScreenState();
}

class _AdminCommissionScreenState extends State<AdminCommissionScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  List<dynamic> _configs = [];
  double _globalRate = 2.0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiService.get('/admin/commission/configs');
      final list = res['data'] as List? ?? [];
      _configs = list;

      // Find current global rate
      final global = list.firstWhere(
        (c) => c['merchantId'] == null,
        orElse: () => null,
      );
      if (global != null) {
        _globalRate = (global['rate'] as num?)?.toDouble() ?? 2.0;
      }
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load commission configs';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Set global commission ─────────────────────────────────────────────────
  Future<void> _setGlobalRate() async {
    final ctrl = TextEditingController(text: _globalRate.toString());
    final descCtrl = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Set Global Commission Rate'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'This rate applies to ALL merchants without a custom override.',
              style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              style: const TextStyle(color: Color(0xFF0F172A)),
              decoration: const InputDecoration(
                labelText: 'Commission Rate (%)',
                suffixText: '%',
                prefixIcon: Icon(Icons.percent, size: 18),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: descCtrl,
              style: const TextStyle(color: Color(0xFF0F172A)),
              decoration: const InputDecoration(
                labelText: 'Description (optional)',
                prefixIcon: Icon(Icons.notes, size: 18),
              ),
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
            style: ElevatedButton.styleFrom(
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            ),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    final rate = double.tryParse(ctrl.text.trim());
    if (rate == null || rate < 0 || rate > 100) {
      _showSnack('Enter a valid rate between 0 and 100');
      return;
    }

    try {
      await ApiService.post('/admin/commission/global', {
        'rate': rate,
        if (descCtrl.text.trim().isNotEmpty)
          'description': descCtrl.text.trim(),
      });
      _showSnack('Global commission set to $rate%');
      _load();
    } on ApiException catch (e) {
      _showSnack(e.message);
    }
  }

  // ── Set per-merchant commission ───────────────────────────────────────────
  Future<void> _setMerchantRate() async {
    final merchantIdCtrl = TextEditingController();
    final rateCtrl = TextEditingController();
    final descCtrl = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Set Merchant Commission'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Override the commission rate for a specific merchant. '
                'This takes priority over the global rate.',
                style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: merchantIdCtrl,
                style: const TextStyle(color: Color(0xFF0F172A)),
                decoration: const InputDecoration(
                  labelText: 'Merchant ID (e.g. MER000001)',
                  prefixIcon: Icon(Icons.store_outlined, size: 18),
                ),
                textCapitalization: TextCapitalization.characters,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: rateCtrl,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                style: const TextStyle(color: Color(0xFF0F172A)),
                decoration: const InputDecoration(
                  labelText: 'Commission Rate (%)',
                  suffixText: '%',
                  prefixIcon: Icon(Icons.percent, size: 18),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: descCtrl,
                style: const TextStyle(color: Color(0xFF0F172A)),
                decoration: const InputDecoration(
                  labelText: 'Description (optional)',
                  prefixIcon: Icon(Icons.notes, size: 18),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            ),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    final merchantId = merchantIdCtrl.text.trim();
    final rate = double.tryParse(rateCtrl.text.trim());

    if (merchantId.isEmpty) {
      _showSnack('Merchant ID required');
      return;
    }
    if (rate == null || rate < 0 || rate > 100) {
      _showSnack('Enter a valid rate between 0 and 100');
      return;
    }

    try {
      await ApiService.post('/admin/commission/merchant/$merchantId', {
        'rate': rate,
        if (descCtrl.text.trim().isNotEmpty)
          'description': descCtrl.text.trim(),
      });
      _showSnack('Commission for $merchantId set to $rate%');
      _load();
    } on ApiException catch (e) {
      _showSnack(e.message);
    }
  }

  // ── Remove merchant override ──────────────────────────────────────────────
  Future<void> _removeOverride(String merchantId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove Override?'),
        content: Text('$merchantId will revert to the global commission rate.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.error,
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ApiService.delete('/admin/commission/merchant/$merchantId');
      _showSnack('Override removed for $merchantId');
      _load();
    } on ApiException catch (e) {
      _showSnack(e.message);
    }
  }

  void _showSnack(String msg) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Separate global vs merchant configs
    final globalConfig = _configs
        .where((c) => c['merchantId'] == null)
        .toList();
    final merchantConfigs = _configs
        .where((c) => c['merchantId'] != null)
        .toList();

    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Commission Config'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _setMerchantRate,
        icon: const Icon(Icons.add),
        label: const Text('Add Override'),
        backgroundColor: AppTheme.primary,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? EmptyState(
              icon: Icons.wifi_off,
              title: 'Error',
              subtitle: _error,
              onAction: _load,
              actionLabel: 'Retry',
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── Global rate card ──────────────────────────────
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'Global Default Rate',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                  ),
                                ),
                                TextButton.icon(
                                  onPressed: _setGlobalRate,
                                  icon: const Icon(Icons.edit, size: 16),
                                  label: const Text('Edit'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: AppTheme.primary.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: AppTheme.primary.withValues(
                                    alpha: 0.2,
                                  ),
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  const Flexible(
                                    child: Text(
                                      'Default Commission Rate',
                                      style: TextStyle(
                                        fontSize: 13,
                                        color: AppTheme.textSecondary,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '$_globalRate%',
                                    style: const TextStyle(
                                      fontSize: 26,
                                      fontWeight: FontWeight.w800,
                                      color: AppTheme.primary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (globalConfig.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Text(
                                'Last updated: ${formatDate(DateTime.tryParse(globalConfig.last['createdAt'] ?? '') ?? DateTime.now())}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.textSecondary,
                                ),
                              ),
                            ],
                            const SizedBox(height: 8),
                            const Text(
                              'This rate applies to all merchants unless a custom override is set.',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // ── Merchant overrides ────────────────────────────
                    SectionHeader(
                      title: 'Merchant Overrides (${merchantConfigs.length})',
                      actionLabel: '+ Add',
                      onAction: _setMerchantRate,
                    ),
                    const SizedBox(height: 8),

                    if (merchantConfigs.isEmpty)
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Center(
                            child: Column(
                              children: [
                                const Icon(
                                  Icons.store_outlined,
                                  size: 40,
                                  color: AppTheme.textHint,
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  'No custom overrides',
                                  style: TextStyle(
                                    color: AppTheme.textSecondary,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'All merchants use global rate ($_globalRate%)',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppTheme.textHint,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      )
                    else
                      ...merchantConfigs.map((c) {
                        final m =
                            c['merchantId'] as Map<String, dynamic>? ?? {};
                        final rate = (c['rate'] as num?)?.toDouble() ?? 0;
                        final diff = rate - _globalRate;
                        final isLower = diff < 0;

                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            m['businessName'] ?? 'Unknown',
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 14,
                                            ),
                                          ),
                                          Text(
                                            m['merchantId'] ?? '',
                                            style: const TextStyle(
                                              fontSize: 11,
                                              color: AppTheme.textSecondary,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    // Rate badge
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: isLower
                                            ? AppTheme.accent.withValues(
                                                alpha: 0.12,
                                              )
                                            : AppTheme.warning.withValues(
                                                alpha: 0.12,
                                              ),
                                        borderRadius: BorderRadius.circular(20),
                                      ),
                                      child: Text(
                                        '$rate%',
                                        style: TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.w800,
                                          color: isLower
                                              ? AppTheme.accent
                                              : AppTheme.warning,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    Icon(
                                      isLower
                                          ? Icons.arrow_downward
                                          : diff > 0
                                          ? Icons.arrow_upward
                                          : Icons.remove,
                                      size: 14,
                                      color: isLower
                                          ? AppTheme.accent
                                          : diff > 0
                                          ? AppTheme.error
                                          : AppTheme.textSecondary,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      diff == 0
                                          ? 'Same as global rate'
                                          : '${diff.abs().toStringAsFixed(1)}% ${isLower ? 'below' : 'above'} global rate',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: isLower
                                            ? AppTheme.accent
                                            : diff > 0
                                            ? AppTheme.error
                                            : AppTheme.textSecondary,
                                      ),
                                    ),
                                    const Spacer(),
                                    // Edit button
                                    TextButton.icon(
                                      style: TextButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 4,
                                        ),
                                      ),
                                      onPressed: () async {
                                        final mId =
                                            m['merchantId'] as String? ?? '';
                                        final rateCtrl = TextEditingController(
                                          text: rate.toString(),
                                        );
                                        final confirmed = await showDialog<bool>(
                                          context: context,
                                          builder: (_) => AlertDialog(
                                            title: Text('Edit Rate: $mId'),
                                            content: TextField(
                                              controller: rateCtrl,
                                              keyboardType:
                                                  const TextInputType.numberWithOptions(
                                                    decimal: true,
                                                  ),
                                              decoration: const InputDecoration(
                                                labelText: 'New Rate (%)',
                                                suffixText: '%',
                                              ),
                                            ),
                                            actions: [
                                              TextButton(
                                                onPressed: () => Navigator.pop(
                                                  context,
                                                  false,
                                                ),
                                                child: const Text('Cancel'),
                                              ),
                                              ElevatedButton(
                                                onPressed: () => Navigator.pop(
                                                  context,
                                                  true,
                                                ),
                                                style: ElevatedButton.styleFrom(
                                                  minimumSize: Size.zero,
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                        horizontal: 20,
                                                        vertical: 10,
                                                      ),
                                                ),
                                                child: const Text('Save'),
                                              ),
                                            ],
                                          ),
                                        );
                                        if (confirmed != true) return;
                                        final newRate = double.tryParse(
                                          rateCtrl.text.trim(),
                                        );
                                        if (newRate == null) return;
                                        try {
                                          await ApiService.post(
                                            '/admin/commission/merchant/$mId',
                                            {'rate': newRate},
                                          );
                                          _showSnack(
                                            'Rate updated to $newRate%',
                                          );
                                          _load();
                                        } on ApiException catch (e) {
                                          _showSnack(e.message);
                                        }
                                      },
                                      icon: const Icon(Icons.edit, size: 14),
                                      label: const Text(
                                        'Edit',
                                        style: TextStyle(fontSize: 12),
                                      ),
                                    ),
                                    // Remove button
                                    TextButton.icon(
                                      style: TextButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 4,
                                        ),
                                        foregroundColor: AppTheme.error,
                                      ),
                                      onPressed: () => _removeOverride(
                                        m['merchantId'] as String? ?? '',
                                      ),
                                      icon: const Icon(
                                        Icons.delete_outline,
                                        size: 14,
                                      ),
                                      label: const Text(
                                        'Remove',
                                        style: TextStyle(fontSize: 12),
                                      ),
                                    ),
                                  ],
                                ),
                                if (c['description'] != null &&
                                    (c['description'] as String)
                                        .isNotEmpty) ...[
                                  const Divider(height: 12),
                                  Text(
                                    c['description'],
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: AppTheme.textSecondary,
                                      fontStyle: FontStyle.italic,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        );
                      }),
                  ],
                ),
              ),
            ),
    );
  }
}
