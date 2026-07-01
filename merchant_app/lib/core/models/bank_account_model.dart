class BankAccountModel {
  final String id;
  final String accountHolderName;
  final String accountNumber;
  final String ifscCode;
  final String bankName;
  final String accountType;
  final bool isPrimary;
  final bool isVerified;

  const BankAccountModel({
    required this.id,
    required this.accountHolderName,
    required this.accountNumber,
    required this.ifscCode,
    required this.bankName,
    required this.accountType,
    required this.isPrimary,
    required this.isVerified,
  });

  factory BankAccountModel.fromJson(Map<String, dynamic> j) => BankAccountModel(
    id: j['id'] ?? j['_id'] ?? '',
    accountHolderName: j['accountHolderName'] ?? '',
    accountNumber: j['accountNumber'] ?? '',
    ifscCode: j['ifscCode'] ?? '',
    bankName: j['bankName'] ?? '',
    accountType: j['accountType'] ?? 'current',
    isPrimary: j['isPrimary'] ?? false,
    isVerified: j['isVerified'] ?? false,
  );
}
