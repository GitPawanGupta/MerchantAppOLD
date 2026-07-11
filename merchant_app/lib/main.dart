import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:firebase_core/firebase_core.dart';
import 'core/providers/auth_provider.dart';
import 'core/providers/notification_provider.dart';
import 'core/services/auth_service.dart';
import 'core/theme/app_theme.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/auth/otp_verification_screen.dart';
import 'screens/auth/forgot_password_screen.dart';
import 'screens/auth/reset_password_screen.dart';
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
import 'screens/profile/edit_profile_screen.dart';
import 'screens/reports/reports_screen.dart';
import 'screens/admin/admin_shell.dart';
import 'screens/admin/admin_bank_accounts_screen.dart';
import 'screens/admin/admin_merchants_screen.dart';
import 'screens/admin/admin_settlements_screen.dart';
import 'screens/admin/admin_transactions_screen.dart';
import 'screens/admin/admin_gateway_screen.dart';
import 'screens/notifications/notifications_screen.dart';
import 'core/models/qr_model.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase (required before any Firebase service)
  await Firebase.initializeApp();

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()..init()),
        // NotificationProvider is role-aware — set isAdmin based on user role
        // after login. HomeShell and AdminShell will call fetchNotifications().
        ChangeNotifierProvider(create: (_) => NotificationProvider()),
      ],
      child: const MerchantApp(),
    ),
  );
}

class MerchantApp extends StatelessWidget {
  const MerchantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ppay For Merchant',
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
      case '/forgot-password':
        return _slide(const ForgotPasswordScreen());
      case '/reset-password':
        // Extract token from arguments
        final token = settings.arguments as String? ?? '';
        return _slide(ResetPasswordScreen(resetToken: token));
      case '/otp-verification':
        // Extract phone/email from arguments
        final args = settings.arguments as Map<String, dynamic>? ?? {};
        return _slide(
          OTPVerificationScreen(
            phone: args['phone'] ?? '',
            email: args['email'],
            verificationType: args['type'] ?? 'phone',
          ),
        );

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
      case '/admin/settlements':
        return _slide(const AdminSettlementsScreen());
      case '/admin/transactions':
        return _slide(const AdminTransactionsScreen());
      case '/admin/gateways':
        return _slide(const AdminGatewayScreen());
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

      // ── Notifications ──────────────────────────────────────────────────────
      case '/notifications':
        return _slide(const NotificationsScreen());

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

class _SplashState extends State<_Splash> with TickerProviderStateMixin {
  late AnimationController _logoCtrl;
  late AnimationController _textCtrl;
  late Animation<double> _logoScale;
  late Animation<double> _logoFade;
  late Animation<double> _textFade;
  late Animation<Offset> _textSlide;

  @override
  void initState() {
    super.initState();

    // Logo animation — scale + fade in
    _logoCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _logoScale = Tween<double>(
      begin: 0.7,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _logoCtrl, curve: Curves.easeOutBack));
    _logoFade = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _logoCtrl, curve: Curves.easeIn));

    // Text animation — slide up + fade in (starts slightly after logo)
    _textCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _textFade = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _textCtrl, curve: Curves.easeIn));
    _textSlide = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _textCtrl, curve: Curves.easeOut));

    // Sequence: logo → text → redirect
    _logoCtrl.forward().then((_) {
      _textCtrl.forward();
    });

    _redirect();
  }

  @override
  void dispose() {
    _logoCtrl.dispose();
    _textCtrl.dispose();
    super.dispose();
  }

  Future<void> _redirect() async {
    try {
      await Permission.locationWhenInUse.request();
    } catch (_) {}

    // Minimum splash display time
    await Future.delayed(const Duration(milliseconds: 1800));
    if (!mounted) return;

    final loggedIn = await AuthService.isLoggedIn();
    if (!mounted) return;

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
      backgroundColor: const Color(0xFFFAF8F5), // premium warm ivory
      body: Stack(
        children: [
          // Subtle radial glow at center
          Center(
            child: Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(
                      0xFFB8960C,
                    ).withValues(alpha: 0.10), // gold glow
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),

          // Main content
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Logo
                ScaleTransition(
                  scale: _logoScale,
                  child: FadeTransition(
                    opacity: _logoFade,
                    child: Container(
                      width: 110,
                      height: 110,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(28),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(
                              0xFFB8960C,
                            ).withValues(alpha: 0.22),
                            blurRadius: 40,
                            spreadRadius: 2,
                            offset: const Offset(0, 8),
                          ),
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.06),
                            blurRadius: 20,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Image.asset(
                        'assets/images/logo.jpeg',
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 28),

                // App name + tagline
                FadeTransition(
                  opacity: _textFade,
                  child: SlideTransition(
                    position: _textSlide,
                    child: Column(
                      children: [
                        const Text(
                          'PPay',
                          style: TextStyle(
                            color: Color(0xFF1A237E), // deep navy — on light bg
                            fontSize: 32,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.5,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Payments. Trust. Growth.',
                          style: TextStyle(
                            color: Color(0xFF9E8A5A), // muted gold
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 2.0,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Bottom loading indicator
          Positioned(
            bottom: 56,
            left: 0,
            right: 0,
            child: FadeTransition(
              opacity: _textFade,
              child: Center(
                child: SizedBox(
                  width: 32,
                  height: 32,
                  child: CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation(
                      const Color(0xFFB8960C).withValues(alpha: 0.5), // gold
                    ),
                    strokeWidth: 1.5,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
