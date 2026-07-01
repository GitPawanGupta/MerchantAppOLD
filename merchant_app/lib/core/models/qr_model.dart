import '../constants/app_constants.dart';

class QRModel {
  final String id;
  final String qrId;
  final String type; // static | dynamic
  final String label;
  final double? fixedAmount;
  final String paymentUrl;
  final bool isActive;
  final int scanCount;
  final int successfulPayments;
  final double totalAmountCollected;
  final DateTime? expiresAt;
  final DateTime createdAt;

  const QRModel({
    required this.id,
    required this.qrId,
    required this.type,
    required this.label,
    this.fixedAmount,
    required this.paymentUrl,
    required this.isActive,
    required this.scanCount,
    required this.successfulPayments,
    required this.totalAmountCollected,
    this.expiresAt,
    required this.createdAt,
  });

  factory QRModel.fromJson(Map<String, dynamic> j) => QRModel(
        id: j['_id'] ?? j['id'] ?? '',
        qrId: j['qrId'] ?? '',
        type: j['type'] ?? 'static',
        label: j['label'] ?? 'Payment QR',
        fixedAmount: (j['fixedAmount'] as num?)?.toDouble(),
        paymentUrl: AppConstants.fixPaymentUrl(j['paymentUrl'] ?? ''),
        isActive: j['isActive'] ?? true,
        scanCount: (j['scanCount'] as num?)?.toInt() ?? 0,
        successfulPayments: (j['successfulPayments'] as num?)?.toInt() ?? 0,
        totalAmountCollected: (j['totalAmountCollected'] as num?)?.toDouble() ?? 0,
        expiresAt: j['expiresAt'] != null ? DateTime.tryParse(j['expiresAt']) : null,
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );

  bool get isExpired => expiresAt != null && DateTime.now().isAfter(expiresAt!);
}
