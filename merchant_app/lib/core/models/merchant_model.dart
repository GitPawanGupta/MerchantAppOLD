class MerchantModel {
  final String id;
  final String merchantId;
  final String businessName;
  final String? businessCategory;
  final String status;
  final String kycStatus;
  final double totalCollected;
  final double totalSettled;
  final double pendingSettlement;
  final BankDetails? bankDetails;
  final int bankAccountCount;
  final String settlementPreference;

  const MerchantModel({
    required this.id,
    required this.merchantId,
    required this.businessName,
    this.businessCategory,
    required this.status,
    required this.kycStatus,
    this.totalCollected = 0,
    this.totalSettled = 0,
    this.pendingSettlement = 0,
    this.bankDetails,
    this.bankAccountCount = 0,
    this.settlementPreference = 'instant',
  });

  factory MerchantModel.fromJson(Map<String, dynamic> j) => MerchantModel(
    id: j['id'] ?? j['_id'] ?? '',
    merchantId: j['merchantId'] ?? '',
    businessName: j['businessName'] ?? '',
    businessCategory: j['businessCategory'],
    status: j['status'] ?? 'pending',
    kycStatus: j['kycStatus'] ?? j['kyc']?['status'] ?? 'pending',
    totalCollected: (j['totalCollected'] as num?)?.toDouble() ?? 0,
    totalSettled: (j['totalSettled'] as num?)?.toDouble() ?? 0,
    pendingSettlement: (j['pendingSettlement'] as num?)?.toDouble() ?? 0,
    bankDetails: j['bankDetails'] != null
        ? BankDetails.fromJson(j['bankDetails'])
        : null,
    bankAccountCount: () {
      final list = j['bankAccounts'] as List?;
      if (list != null && list.isNotEmpty) return list.length;
      if (j['bankDetails'] != null) return 1;
      return 0;
    }(),
    settlementPreference: j['settlementPreference'] ?? 'instant',
  );
}

class BankDetails {
  final String accountHolderName;
  final String accountNumber; // masked
  final String ifscCode;
  final String bankName;
  final String accountType;
  final bool isVerified;

  const BankDetails({
    required this.accountHolderName,
    required this.accountNumber,
    required this.ifscCode,
    required this.bankName,
    required this.accountType,
    required this.isVerified,
  });

  factory BankDetails.fromJson(Map<String, dynamic> j) => BankDetails(
    accountHolderName: j['accountHolderName'] ?? '',
    accountNumber: j['accountNumber'] ?? '',
    ifscCode: j['ifscCode'] ?? '',
    bankName: j['bankName'] ?? '',
    accountType: j['accountType'] ?? 'current',
    isVerified: j['isVerified'] ?? false,
  );
}
