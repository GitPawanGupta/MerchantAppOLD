import 'package:flutter/foundation.dart';
import '../models/notification_model.dart';
import '../services/api_service.dart';

class NotificationProvider extends ChangeNotifier {
  List<AppNotification> _notifications = [];
  int _unreadCount = 0;
  bool _loading = false;
  bool _isAdmin = false;

  List<AppNotification> get notifications => _notifications;
  int get unreadCount => _unreadCount;
  bool get loading => _loading;

  // Called by HomeShell (merchant) or AdminShell (admin) after mount
  void setRole({required bool isAdmin}) {
    if (_isAdmin != isAdmin) {
      _isAdmin = isAdmin;
      _notifications = [];
      _unreadCount = 0;
    }
  }

  String get _endpoint =>
      _isAdmin ? '/notifications/admin' : '/notifications/merchant';

  // ── Fetch from backend ───────────────────────────────────────────────────
  Future<void> fetchNotifications() async {
    try {
      _loading = true;
      notifyListeners();

      final res = await ApiService.get(_endpoint);
      final data = res['data'] as Map<String, dynamic>;

      _notifications = (data['notifications'] as List)
          .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
          .toList();
      _unreadCount = (data['unreadCount'] as num?)?.toInt() ?? 0;
    } catch (e) {
      debugPrint('[NotificationProvider] fetchNotifications error: $e');
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  // ── Mark single notification as read ────────────────────────────────────
  Future<void> markAsRead(String id) async {
    final idx = _notifications.indexWhere((n) => n.id == id);
    if (idx != -1 && !_notifications[idx].isRead) {
      _notifications[idx] = _notifications[idx].copyWith(isRead: true);
      _unreadCount = (_unreadCount - 1).clamp(0, 9999);
      notifyListeners();
    }
    try {
      await ApiService.patch('$_endpoint/$id/read', {});
    } catch (e) {
      debugPrint('[NotificationProvider] markAsRead error: $e');
    }
  }

  // ── Mark all as read ─────────────────────────────────────────────────────
  Future<void> markAllAsRead() async {
    _notifications = _notifications
        .map((n) => n.isRead ? n : n.copyWith(isRead: true))
        .toList();
    _unreadCount = 0;
    notifyListeners();
    try {
      await ApiService.patch('$_endpoint/read-all', {});
    } catch (e) {
      debugPrint('[NotificationProvider] markAllAsRead error: $e');
    }
  }

  // ── Refresh unread count (lightweight, called on dashboard load) ─────────
  Future<void> refreshUnreadCount() async {
    try {
      final res = await ApiService.get(_endpoint);
      final data = res['data'] as Map<String, dynamic>;
      final newCount = (data['unreadCount'] as num?)?.toInt() ?? 0;
      if (newCount != _unreadCount) {
        _unreadCount = newCount;
        _notifications = (data['notifications'] as List)
            .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
            .toList();
        notifyListeners();
      }
    } catch (_) {}
  }
}
