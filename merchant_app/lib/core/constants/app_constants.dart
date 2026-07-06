class AppConstants {
  // ── API ────────────────────────────────────────────────────────────────────
  // Primary: app.pasuai.online (Railway — Razorpay verified ✅)
  static const String baseUrl = 'https://app.pasuai.online/api';

  // ── Payment page base URL (Railway backend) ────────────────────────────────
  // QR payment links are served by the Railway backend.
  // Any paymentUrl from the server that still references the old Render host
  // is rewritten to this base so the correct page is loaded.
  static const String paymentBaseUrl =
      'https://merchantappold-production.up.railway.app';
  static const String _oldRenderHost = 'merchantapp-1nz3.onrender.com';
  static const String _newRailwayHost =
      'merchantappold-production.up.railway.app';

  /// Rewrites an old Render.com paymentUrl to the Railway host.
  static String fixPaymentUrl(String url) =>
      url.replaceFirst(_oldRenderHost, _newRailwayHost);

  // ── Uncomment ONE of these for local development ───────────────────────────
  // static const String baseUrl = 'http://10.0.2.2:5000/api';       // Android emulator
  // static const String baseUrl = 'http://localhost:5000/api';       // iOS sim / web
  // static const String baseUrl = 'http://192.168.1.100:5000/api';   // Physical device (replace IP)

  // ── Storage keys ──────────────────────────────────────────────────────────
  static const String keyAccessToken = 'access_token';
  static const String keyRefreshToken = 'refresh_token';
  static const String keyUser = 'user_data';
  static const String keyMerchant = 'merchant_data';

  // ── Timeouts ───────────────────────────────────────────────────────────────
  // Railway.com keeps services warm — generous timeouts still help on slow networks.
  static const Duration connectTimeout = Duration(seconds: 20);
  static const Duration receiveTimeout = Duration(seconds: 60);

  // ── Pagination ─────────────────────────────────────────────────────────────
  static const int pageSize = 15;

  // ── Payment methods display ───────────────────────────────────────────────
  static const Map<String, String> paymentMethodLabels = {
    'upi': 'UPI',
    'card': 'Card',
    'netbanking': 'Net Banking',
    'wallet': 'Wallet',
    'emi': 'EMI',
    'unknown': 'Other',
  };

  // ── Transaction status colors (hex strings used in theme) ─────────────────
  static const Map<String, int> txStatusColor = {
    'success': 0xFF22C55E,
    'pending': 0xFFF59E0B,
    'failed': 0xFFEF4444,
    'cancelled': 0xFF94A3B8,
    'created': 0xFF64748B,
    'refunded': 0xFF8B5CF6,
  };

  // ── Settlement status colors ───────────────────────────────────────────────
  static const Map<String, int> settlementStatusColor = {
    'success': 0xFF22C55E,
    'processing': 0xFF3B82F6,
    'pending': 0xFFF59E0B,
    'failed': 0xFFEF4444,
    'reversed': 0xFF8B5CF6,
  };

  // ── KYC status ─────────────────────────────────────────────────────────────
  static const Map<String, int> kycStatusColor = {
    'approved': 0xFF22C55E,
    'submitted': 0xFF3B82F6,
    'under_review': 0xFFF59E0B,
    'rejected': 0xFFEF4444,
    'pending': 0xFF94A3B8,
  };
}
