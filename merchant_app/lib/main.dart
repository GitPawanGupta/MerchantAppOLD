import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'core/providers/auth_provider.dart';
import 'core/services/auth_service.dart';
import 'core/theme/app_theme.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/dashboard/home_shell.dart';
import 'screens/qr/qr_list_screen.dart';
import 'screens/qr/qr_detail_screen.dart';
import 'screens/qr/create_static_qr_screen.dart';
import 'screens/qr/create_dynamic_qr_screen.dart';
import 'screens/transactions/transaction_list_screen.dart';
import 'screens/transactions/transaction_detail_screen.dart';
import 'screens/settlements/settlement_list_screen.dart';
import 'screens/settlements/settlement_detail_screen.dart';
import 'screens/profile/profile_screen.dart';
import 'screens/profile/kyc_screen.dart';
import 'screens/profile/bank_details_screen.dart';
import 'screens/profile/bank_accounts_screen.dart';
import 'screens/profile/change_password_screen.dart';
import 'screens/profile/connect_razorpay_screen.dart';
import 'screens/profile/connect_razorpay_screen.dart';
import 'screens/reports/reports_screen.dart';
import 'screens/admin/admin_shell.dart';
import 'screens/admin/admin_bank_accounts_screen.dart';
import 'core/models/qr_model.dart';
import 'screens/admin/admin_merchants_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthProvider()..init(),
      child: const MerchantApp(),
    ),
  );
}

class MerchantApp extends StatelessWidget {
  const MerchantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ISS Merchant',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const _Splash(),
      onGenerateRoute: _generateRoute,
    );
  }

  static Route<dynamic>? _generateRoute(RouteSettings settings) {
    switch (settings.name) {
      // ── Auth ──────────────────────────────────────────────────────────────
      case '/login':
        return _slide(const LoginScreen());
      case '/register':
        return _slide(const RegisterScreen());

      // ── Main app (merchant) ───────────────────────────────────────────────
      case '/home':
        return _slide(const HomeShell());

      // ── Admin panel ───────────────────────────────────────────────────────
      case '/admin':
        return _slide(const AdminShell());
      case '/admin/bank-accounts':
        return _slide(const AdminBankAccountsScreen());
      case '/admin/merchants':
        return _slide(const AdminMerchantsScreen());
      // ── QR ────────────────────────────────────────────────────────────────
      case '/qr-list':
        return _slide(const QRListScreen());
      case '/qr-create-static':
        return _slide(const CreateStaticQRScreen());
      case '/qr-create-dynamic':
        return _slide(const CreateDynamicQRScreen());
      case '/qr-detail':
        final qr = settings.arguments as QRModel;
        return _slide(QRDetailScreen(qr: qr));

      // ── Transactions ──────────────────────────────────────────────────────
      case '/transactions':
        return _slide(const TransactionListScreen());
      case '/transaction-detail':
        final orderId = settings.arguments as String;
        return _slide(TransactionDetailScreen(orderId: orderId));

      // ── Settlements ───────────────────────────────────────────────────────
      case '/settlements':
        return _slide(const SettlementListScreen());
      case '/settlement-detail':
        final ref = settings.arguments as String;
        return _slide(SettlementDetailScreen(settlementRef: ref));

      // ── Reports ───────────────────────────────────────────────────────────
      case '/reports':
        return _slide(const ReportsScreen());

      // ── Profile ───────────────────────────────────────────────────────────
      case '/profile':
        return _slide(const ProfileScreen());
      case '/edit-profile':
        return _slide(const EditProfileScreen());
      case '/kyc':
        return _slide(const KYCScreen());
      case '/bank-details':
        return _slide(const BankDetailsScreen());
      case '/bank-accounts':
        return _slide(const BankAccountsScreen());
      case '/change-password':
        return _slide(const ChangePasswordScreen());
      case '/connect-razorpay':
        return _slide(const ConnectRazorpayScreen());

      default:
        return _slide(const LoginScreen());
    }
  }

  static PageRouteBuilder _slide(Widget page) => PageRouteBuilder(
    pageBuilder: (_, _, _) => page,
    transitionsBuilder: (_, anim, _, child) => SlideTransition(
      position: Tween<Offset>(
        begin: const Offset(1, 0),
        end: Offset.zero,
      ).animate(CurvedAnimation(parent: anim, curve: Curves.easeInOut)),
      child: child,
    ),
    transitionDuration: const Duration(milliseconds: 250),
  );
}

// ── Splash / route guard ───────────────────────────────────────────────────
class _Splash extends StatefulWidget {
  const _Splash();
  @override
  State<_Splash> createState() => _SplashState();
}

class _SplashState extends State<_Splash> {
  @override
  void initState() {
    super.initState();
    _redirect();
  }

  Future<void> _redirect() async {
    // Request location permission on startup (NPCI / UPI transaction security best practice)
    try {
      await Permission.locationWhenInUse.request();
    } catch (_) {}

    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;
    final loggedIn = await AuthService.isLoggedIn();
    if (!mounted) return;

    // Check if logged-in user is admin → send to admin panel
    if (loggedIn) {
      final user = await AuthService.getCachedUser();
      if (!mounted) return;
      if (user?.role == 'admin') {
        Navigator.pushReplacementNamed(context, '/admin');
      } else {
        Navigator.pushReplacementNamed(context, '/home');
      }
    } else {
      Navigator.pushReplacementNamed(context, '/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(Icons.qr_code_2, color: Colors.white, size: 64),
            ),
            const SizedBox(height: 24),
            const Text(
              'ISS Merchant',
              style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Instant Settlement System',
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 48),
            const CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation(Colors.white),
              strokeWidth: 2,
            ),
          ],
        ),
      ),
    );
  }
}
