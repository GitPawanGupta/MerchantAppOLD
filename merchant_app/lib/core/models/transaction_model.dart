class TransactionModel {
  final String id;
  final String orderId;
  final double amount;
  final double commissionAmount;
  final double settlementAmount;
  final double commissionRate;
  final String status;
  final String paymentMethod;
  final String? customerName;
  final String? customerPhone;
  final String? cfPaymentId;
  final String? cfReferenceId;
  final bool isSettled;
  final DateTime createdAt;
  final DateTime? paymentTime;

  const TransactionModel({
    required this.id,
    required this.orderId,
    required this.amount,
    required this.commissionAmount,
    required this.settlementAmount,
    required this.commissionRate,
    required this.status,
    required this.paymentMethod,
    this.customerName,
    this.customerPhone,
    this.cfPaymentId,
    this.cfReferenceId,
    required this.isSettled,
    required this.createdAt,
    this.paymentTime,
  });

  factory TransactionModel.fromJson(Map<String, dynamic> j) => TransactionModel(
        id: j['_id'] ?? j['id'] ?? '',
        orderId: j['orderId'] ?? '',
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        commissionAmount: (j['commissionAmount'] as num?)?.toDouble() ?? 0,
        settlementAmount: (j['settlementAmount'] as num?)?.toDouble() ?? 0,
        commissionRate: (j['commissionRate'] as num?)?.toDouble() ?? 0,
        status: j['status'] ?? 'pending',
        paymentMethod: j['paymentMethod'] ?? 'unknown',
        customerName: j['customerName'],
        customerPhone: j['customerPhone'],
        cfPaymentId: j['cfPaymentId'],
        cfReferenceId: j['cfReferenceId'],
        isSettled: j['isSettled'] ?? false,
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        paymentTime: j['paymentTime'] != null ? DateTime.tryParse(j['paymentTime']) : null,
      );
}
