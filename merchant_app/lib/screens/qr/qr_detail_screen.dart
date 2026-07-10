import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:gal/gal.dart';
import 'package:http/http.dart' as http;
import '../../core/models/qr_model.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class QRDetailScreen extends StatefulWidget {
  final QRModel qr;
  const QRDetailScreen({super.key, required this.qr});
  @override
  State<QRDetailScreen> createState() => _QRDetailScreenState();
}

class _QRDetailScreenState extends State<QRDetailScreen> {
  final _qrKey = GlobalKey();
  bool _deactivating = false;
  bool _saving = false;
  bool _sharing = false;
  late QRModel _qr; // mutable — updated after sync

  @override
  void initState() {
    super.initState();
    _qr = widget.qr;
  }

  // Pull-to-refresh: sync missed payments then reload QR stats
  Future<void> _onRefresh() async {
    try {
      // 1. Trigger sync silently
      await ApiService.post('/qr/${_qr.qrId}/sync', {});
    } catch (_) {
      // Non-fatal — still reload
    }
    try {
      // 2. Reload QR detail to get updated stats
      final res = await ApiService.get('/qr?qrId=${_qr.qrId}');
      final list = res['data'] as List?;
      if (list != null && list.isNotEmpty) {
        final updated = QRModel.fromJson(list.first as Map<String, dynamic>);
        if (mounted) setState(() => _qr = updated);
      }
    } catch (_) {}
  }

  Future<Uint8List> _getQRBytes() async {
    if (_qr.isRazorpayQR) {
      final response = await http.get(Uri.parse(_qr.razorpayQrImageUrl!));
      if (response.statusCode == 200) return response.bodyBytes;
    }
    final boundary =
        _qrKey.currentContext!.findRenderObject() as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 3.0);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    return byteData!.buffer.asUint8List();
  }

  Future<void> _saveQR() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final bytes = await _getQRBytes();
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/qr_${_qr.qrId}.png';
      await File(path).writeAsBytes(bytes);
      await Gal.putImage(path);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('QR Code saved to Gallery successfully!'),
            backgroundColor: AppTheme.accent,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Save failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _shareQR() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final bytes = await _getQRBytes();
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/qr_${_qr.qrId}.png';
      await File(path).writeAsBytes(bytes);
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(path)],
          text: 'Pay to ${_qr.label} using this link: ${_qr.paymentUrl}',
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Share failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _copyLink() async {
    await Clipboard.setData(ClipboardData(text: _qr.paymentUrl));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment link copied to clipboard')),
      );
    }
  }

  Future<void> _deactivate() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Deactivate QR?'),
        content: const Text('This QR code will no longer accept payments.'),
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
            child: const Text('Deactivate'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _deactivating = true);
    try {
      await ApiService.patch('/qr/${_qr.qrId}/deactivate', {});
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('QR code deactivated')));
        Navigator.pop(context);
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _deactivating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final qr = _qr; // use mutable local copy
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: Text(qr.label),
        actions: [
          if (qr.isActive)
            PopupMenuButton(
              itemBuilder: (_) => [
                const PopupMenuItem(
                  value: 'deactivate',
                  child: Text('Deactivate'),
                ),
              ],
              onSelected: (v) {
                if (v == 'deactivate') _deactivate();
              },
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _onRefresh,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
            // ── QR Card ────────────────────────────────────────────────
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    RepaintBoundary(
                      key: _qrKey,
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          children: [
                            // Razorpay UPI QR — hosted image (no PhonePe warning)
                            if (qr.isRazorpayQR)
                              Stack(
                                alignment: Alignment.topRight,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.network(
                                      qr.razorpayQrImageUrl!,
                                      width: 220,
                                      height: 220,
                                      fit: BoxFit.contain,
                                      loadingBuilder: (ctx, child, progress) {
                                        if (progress == null) return child;
                                        return SizedBox(
                                          width: 220,
                                          height: 220,
                                          child: Center(
                                            child: CircularProgressIndicator(
                                              value:
                                                  progress.expectedTotalBytes !=
                                                      null
                                                  ? progress.cumulativeBytesLoaded /
                                                        progress
                                                            .expectedTotalBytes!
                                                  : null,
                                            ),
                                          ),
                                        );
                                      },
                                      errorBuilder: (_, __, ___) => QrImageView(
                                        data: qr.paymentUrl,
                                        version: QrVersions.auto,
                                        size: 220,
                                        backgroundColor: Colors.white,
                                      ),
                                    ),
                                  ),
                                  // UPI badge
                                  Positioned(
                                    top: 4,
                                    right: 4,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 3,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.green.shade600,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: const Text(
                                        'UPI QR',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              )
                            // Fallback URL QR
                            else
                              QrImageView(
                                data: qr.paymentUrl,
                                version: QrVersions.auto,
                                size: 220,
                                backgroundColor: Colors.white,
                                eyeStyle: const QrEyeStyle(
                                  eyeShape: QrEyeShape.square,
                                  color: Color(0xFF6C63FF),
                                ),
                                dataModuleStyle: const QrDataModuleStyle(
                                  dataModuleShape: QrDataModuleShape.circle,
                                  color: Color(0xFF0F172A),
                                ),
                              ),
                            const SizedBox(height: 12),
                            Text(
                              qr.label,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                            ),
                            if (qr.fixedAmount != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                formatCurrency(qr.fixedAmount!),
                                style: const TextStyle(
                                  color: AppTheme.primary,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 22,
                                ),
                              ),
                            ],
                            // QR type indicator
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  qr.isRazorpayQR
                                      ? Icons.verified_rounded
                                      : Icons.qr_code_rounded,
                                  size: 13,
                                  color: qr.isRazorpayQR
                                      ? Colors.green.shade600
                                      : Colors.grey.shade400,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  qr.isRazorpayQR
                                      ? 'UPI QR — opens directly in UPI apps'
                                      : 'URL QR — opens via browser',
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: qr.isRazorpayQR
                                        ? Colors.green.shade600
                                        : Colors.grey.shade400,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    // Action buttons
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _saving ? null : _saveQR,
                            icon: _saving
                                ? const SizedBox(
                                    height: 16,
                                    width: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.download_outlined),
                            label: const Text('Save to Gallery'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _sharing ? null : _shareQR,
                            icon: _sharing
                                ? const SizedBox(
                                    height: 16,
                                    width: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: AppTheme.primary,
                                    ),
                                  )
                                : const Icon(Icons.share_outlined),
                            label: const Text('Share QR'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _copyLink,
                            icon: const Icon(Icons.copy_outlined),
                            label: const Text('Copy Link'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ── Stats ─────────────────────────────────────────────────
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Statistics',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 12),
                    InfoRow(label: 'Total Scans', value: '${qr.scanCount}'),
                    InfoRow(
                      label: 'Successful Payments',
                      value: '${qr.successfulPayments}',
                    ),
                    InfoRow(
                      label: 'Amount Collected',
                      value: formatCurrency(qr.totalAmountCollected),
                    ),
                    InfoRow(
                      label: 'Type',
                      value: qr.type == 'static' ? 'Static' : 'Dynamic',
                    ),
                    if (qr.expiresAt != null)
                      InfoRow(
                        label: 'Expires At',
                        value: formatDateTime(qr.expiresAt!),
                      ),
                    InfoRow(
                      label: 'Created',
                      value: formatDateTime(qr.createdAt),
                      isLast: true,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ── Status ────────────────────────────────────────────────
            if (!qr.isActive || qr.isExpired)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.error.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppTheme.error.withValues(alpha: 0.3),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.block, color: AppTheme.error),
                    const SizedBox(width: 10),
                    Text(
                      qr.isExpired
                          ? 'This QR has expired'
                          : 'This QR is inactive',
                      style: const TextStyle(
                        color: AppTheme.error,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            if (qr.isActive && !qr.isExpired) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.error,
                    side: const BorderSide(color: AppTheme.error),
                  ),
                  onPressed: _deactivating ? null : _deactivate,
                  child: _deactivating
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Deactivate QR'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
