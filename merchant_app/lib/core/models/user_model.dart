class UserModel {
  final String id;
  final String name;
  final String email;
  final String phone;
  final String role;
  final DateTime? lastLogin;

  const UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    this.lastLogin,
  });

  factory UserModel.fromJson(Map<String, dynamic> j) => UserModel(
        id: j['id'] ?? j['_id'] ?? '',
        name: j['name'] ?? '',
        email: j['email'] ?? '',
        phone: j['phone'] ?? '',
        role: j['role'] ?? 'merchant',
        lastLogin: j['lastLogin'] != null ? DateTime.tryParse(j['lastLogin']) : null,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'role': role,
      };
}
