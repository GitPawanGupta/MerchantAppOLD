import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_service.dart';

// ── Background message handler (must be top-level function) ─────────────────
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase is already initialized by this point via FirebaseMessaging.onBackgroundMessage
  // We just need to show the local notification if needed
  await NotificationService._showLocalNotification(message);
}

// ── Notification Service ──────────────────────────────────────────────────────
class NotificationService {
  NotificationService._();

  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static final FirebaseMessaging _fcm = FirebaseMessaging.instance;

  // Android notification channel for payment alerts
  static const AndroidNotificationChannel _paymentChannel =
      AndroidNotificationChannel(
    'payment_alerts',       // must match backend channelId
    'Payment Alerts',
    description: 'Notifications for incoming payments via QR scan',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
    enableLights: true,
    ledColor: Color(0xFF1976D2),
  );

  // Android notification channel for settlement updates
  static const AndroidNotificationChannel _settlementChannel =
      AndroidNotificationChannel(
    'settlement_updates',
    'Settlement Updates',
    description: 'Notifications for settlement status changes',
    importance: Importance.high,
    playSound: true,
  );

  // ── Initialize ──────────────────────────────────────────────────────────────
  static Future<void> initialize() async {
    // 1. Request permission (iOS + Android 13+)
    final settings = await _fcm.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      debugPrint('[NotificationService] Permission denied by user');
      return;
    }

    // 2. Setup local notifications plugin
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,  // already requested via FCM
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: _onNotificationTapped,
    );

    // 3. Create Android notification channels
    final androidPlugin = _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(_paymentChannel);
    await androidPlugin?.createNotificationChannel(_settlementChannel);

    // 4. Register background handler
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    // 5. Handle foreground messages — FCM won't auto-show heads-up on Android
    //    when app is in foreground, so we show local notification manually
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint('[NotificationService] Foreground message: ${message.messageId}');
      _showLocalNotification(message);
    });

    // 6. Handle notification tap when app is in background (not terminated)
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      debugPrint('[NotificationService] Notification tapped (background): ${message.data}');
      _handleNotificationTap(message.data);
    });

    // 7. Handle notification tap when app was terminated
    final initial = await _fcm.getInitialMessage();
    if (initial != null) {
      debugPrint('[NotificationService] App opened from terminated via notification');
      _handleNotificationTap(initial.data);
    }

    // 8. Set foreground presentation options (iOS)
    await _fcm.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    debugPrint('[NotificationService] Initialized');
  }

  // ── Get & register FCM token ────────────────────────────────────────────────
  static Future<String?> getAndRegisterToken() async {
    try {
      final token = await _fcm.getToken();
      if (token != null) {
        debugPrint('[NotificationService] FCM token: ${token.substring(0, 20)}...');
        await _registerTokenWithBackend(token);
      }

      // Listen for token refresh — update backend automatically
      _fcm.onTokenRefresh.listen((newToken) {
        debugPrint('[NotificationService] FCM token refreshed');
        _registerTokenWithBackend(newToken);
      });

      return token;
    } catch (e) {
      debugPrint('[NotificationService] Failed to get FCM token: $e');
      return null;
    }
  }

  static Future<void> _registerTokenWithBackend(String token) async {
    try {
      await ApiService.post('/merchant/fcm-token', {'fcmToken': token});
      debugPrint('[NotificationService] FCM token registered with backend');
    } catch (e) {
      // Non-critical — token will be retried on next app open
      debugPrint('[NotificationService] Failed to register FCM token: $e');
    }
  }

  // ── Show local notification ─────────────────────────────────────────────────
  static Future<void> _showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    final data = message.data;

    // Determine which channel to use
    final isPayment = data['type'] == 'payment_received';
    final channel = isPayment ? _paymentChannel : _settlementChannel;

    final androidDetails = AndroidNotificationDetails(
      channel.id,
      channel.name,
      channelDescription: channel.description,
      importance: channel.importance,
      priority: Priority.high,
      ticker: notification?.title ?? 'New notification',
      styleInformation: BigTextStyleInformation(
        notification?.body ?? '',
        contentTitle: notification?.title,
        summaryText: isPayment ? 'Payment Alert' : 'Settlement Update',
      ),
      color: const Color(0xFF1976D2),
      icon: '@mipmap/ic_launcher',
      playSound: true,
      enableVibration: true,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    await _localNotifications.show(
      message.hashCode,
      notification?.title ?? _defaultTitle(data),
      notification?.body ?? '',
      NotificationDetails(android: androidDetails, iOS: iosDetails),
      payload: data['type'],
    );
  }

  static String _defaultTitle(Map<String, dynamic> data) {
    if (data['type'] == 'payment_received') {
      final amount = data['amount'] ?? '';
      return '💰 Payment Received${amount.isNotEmpty ? ' — ₹$amount' : ''}';
    }
    return 'ISS Merchant';
  }

  // ── Handle notification tap ─────────────────────────────────────────────────
  static void _onNotificationTapped(NotificationResponse response) {
    debugPrint('[NotificationService] Local notification tapped: ${response.payload}');
    // Navigation is handled at app level — payload carries the type
  }

  static void _handleNotificationTap(Map<String, dynamic> data) {
    // Can extend this to navigate to specific screens
    final type = data['type'];
    debugPrint('[NotificationService] Handling tap for type: $type');
  }

  // ── Utility ─────────────────────────────────────────────────────────────────
  static Future<void> clearBadge() async {
    if (Platform.isIOS) {
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(badge: true);
    }
  }
}
