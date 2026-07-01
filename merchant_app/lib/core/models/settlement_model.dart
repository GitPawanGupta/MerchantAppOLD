class SettlementModel {
  final String id;
  final String settlementRef;
  final double grossAmount;
  final double totalCommission;
  final double netAmount;
  final int transactionCount;
  final String status;
  final String type;
  final String? payoutMode;
  final String? payoutReferenceId;
  final String? bankAccountNumber;
  final String? bankName;
  final DateTime createdAt;
  final DateTime? completedAt;

  const SettlementModel({
    required this.id,
    required this.settlementRef,
    required this.grossAmount,
    required this.totalCommission,
    required this.netAmount,
    required this.transactionCount,
    required this.status,
    required this.type,
    this.payoutMode,
    this.payoutReferenceId,
    this.bankAccountNumber,
    this.bankName,
    required this.createdAt,
    this.completedAt,
  });

  factory SettlementModel.fromJson(Map<String, dynamic> j) => SettlementModel(
        id: j['_id'] ?? j['id'] ?? '',
        settlementRef: j['settlementRef'] ?? '',
        grossAmount: (j['grossAmount'] as num?)?.toDouble() ?? 0,
        totalCommission: (j['totalCommission'] as num?)?.toDouble() ?? 0,
        netAmount: (j['netAmount'] as num?)?.toDouble() ?? 0,
        transactionCount: (j['transactionCount'] as num?)?.toInt() ?? 0,
        status: j['status'] ?? 'pending',
        type: j['type'] ?? 'instant',
        payoutMode: j['payoutMode'],
        payoutReferenceId: j['payoutReferenceId'],
        bankAccountNumber: j['bankAccountNumber'],
        bankName: j['bankName'],
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        completedAt: j['completedAt'] != null ? DateTime.tryParse(j['completedAt']) : null,
      );
}
