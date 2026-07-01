import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../core/services/api_service.dart';
import '../../core/models/qr_model.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class QRListScreen extends StatefulWidget {
  const QRListScreen({super.key});
  @override
  State<QRListScreen> createState() => _QRListScreenState();
}

class _QRListScreenState extends State<QRListScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tab;
  List<QRModel> _all = [], _static = [], _dynamic = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 3, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiService.get('/qr');
      final list = (res['data'] as List)
          .map((e) => QRModel.fromJson(e))
          .toList();
      _all = list;
      _static = list.where((q) => q.type == 'static').toList();
      _dynamic = list.where((q) => q.type == 'dynamic').toList();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load QR codes';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('QR Codes'),
        bottom: TabBar(
          controller: _tab,
          labelColor: AppTheme.primary,
          unselectedLabelColor: AppTheme.textSecondary,
          indicatorColor: AppTheme.primary,
          tabs: const [
            Tab(text: 'All'),
            Tab(text: 'Static'),
            Tab(text: 'Dynamic'),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FloatingActionButton.small(
            heroTag: 'dynamic',
            backgroundColor: AppTheme.accent,
            onPressed: () async {
              await Navigator.pushNamed(context, '/qr-create-dynamic');
              _load();
            },
            child: const Icon(Icons.flash_on, color: Colors.white),
          ),
          const SizedBox(height: 8),
          FloatingActionButton(
            heroTag: 'static',
            backgroundColor: AppTheme.primary,
            onPressed: () async {
              await Navigator.pushNamed(context, '/qr-create-static');
              _load();
            },
            child: const Icon(Icons.add, color: Colors.white),
          ),
        ],
      ),
      body: _loading
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
                _QRListView(qrCodes: _all, onRefresh: _load),
                _QRListView(qrCodes: _static, onRefresh: _load),
                _QRListView(qrCodes: _dynamic, onRefresh: _load),
              ],
            ),
    );
  }
}

class _QRListView extends StatelessWidget {
  final List<QRModel> qrCodes;
  final VoidCallback onRefresh;
  const _QRListView({required this.qrCodes, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    if (qrCodes.isEmpty) {
      return const EmptyState(
        icon: Icons.qr_code_2,
        title: 'No QR codes yet',
        subtitle: 'Tap + to create your first QR code',
      );
    }
    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: qrCodes.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (_, i) => _QRTile(qr: qrCodes[i], onRefresh: onRefresh),
      ),
    );
  }
}

class _QRTile extends StatelessWidget {
  final QRModel qr;
  final VoidCallback onRefresh;
  const _QRTile({required this.qr, required this.onRefresh});

  Future<void> _confirmDelete(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete QR?'),
        content: Text('Delete "${qr.label}"? This cannot be undone.'),
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
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ApiService.delete('/qr/${qr.qrId}');
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('QR code deleted')));
      onRefresh();
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () async {
          await Navigator.pushNamed(context, '/qr-detail', arguments: qr);
          onRefresh();
        },
        onLongPress: () => _confirmDelete(context),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.divider),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(9),
                  child: QrImageView(
                    data: qr.paymentUrl,
                    version: QrVersions.auto,
                    size: 64,
                    backgroundColor: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            qr.label,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        _TypeBadge(type: qr.type),
                      ],
                    ),
                    const SizedBox(height: 4),
                    if (qr.fixedAmount != null)
                      Text(
                        formatCurrency(qr.fixedAmount!),
                        style: const TextStyle(
                          color: AppTheme.primary,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Icon(
                          Icons.qr_code_scanner,
                          size: 12,
                          color: AppTheme.textSecondary,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${qr.scanCount} scans  •  ${qr.successfulPayments} paid',
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                        if (!qr.isActive) ...[
                          const Spacer(),
                          const _StatusBadge(
                            label: 'INACTIVE',
                            color: Color(0xFF94A3B8),
                          ),
                        ],
                        if (qr.isExpired) ...[
                          const Spacer(),
                          const _StatusBadge(
                            label: 'EXPIRED',
                            color: Color(0xFFEF4444),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeBadge extends StatelessWidget {
  final String type;
  const _TypeBadge({required this.type});

  @override
  Widget build(BuildContext context) {
    final isDynamic = type == 'dynamic';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: isDynamic
            ? AppTheme.accent.withValues(alpha: 0.12)
            : AppTheme.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        isDynamic ? 'Dynamic' : 'Static',
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: isDynamic ? AppTheme.accent : AppTheme.primary,
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String label;
  final Color color;
  const _StatusBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
