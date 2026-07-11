class AppNotification {
  final String id;
  final String type; // payment_received | settlement_update | kyc_update | system
  final String title;
  final String body;
  final Map<String, dynamic> data;
  final bool isRead;
  final DateTime? readAt;
  final DateTime createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.data,
    required this.isRead,
    this.readAt,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id:        json['_id'] as String? ?? '',
      type:      json['type'] as String? ?? 'system',
      title:     json['title'] as String? ?? '',
      body:      json['body'] as String? ?? '',
      data:      (json['data'] as Map<String, dynamic>?) ?? {},
      isRead:    json['isRead'] as bool? ?? false,
      readAt:    json['readAt'] != null ? DateTime.tryParse(json['readAt']) : null,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    );
  }

  AppNotification copyWith({bool? isRead}) => AppNotification(
    id:        id,
    type:      type,
    title:     title,
    body:      body,
    data:      data,
    isRead:    isRead ?? this.isRead,
    readAt:    isRead == true ? DateTime.now() : readAt,
    createdAt: createdAt,
  );
}
