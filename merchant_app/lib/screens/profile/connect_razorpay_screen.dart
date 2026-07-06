import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';

class ConnectRazorpayScreen extends StatefulWidget {
  const ConnectRazorpayScreen({super.key});

  @override
  State<ConnectRazorpayScreen> createState() => _ConnectRazorpayScreenState();
}

class _ConnectRazorpayScreenState extends State<ConnectRazorpayScreen> {
  bool _loading = false;
  bool _disconnecting = false;

  Future<void> _connectRazorpay() async {
    setState(() => _loading = true);
    try {
      final data = await ApiService.get('/partner/connect');
      final url = data['data']['url'] as String?;
      if (url == null) throw Exception('No URL received');

      final uri = Uri.parse(url);

      // Try external browser first, fallback to in-app WebView
      bool launched = false;
      try {
        launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      } catch (_) {}

      if (!launched) {
        try {
          launched = await launchUrl(uri, mode: LaunchMode.inAppWebView);
        } catch (_) {}
      }

      if (!launched) {
        throw Exception(
          'Cannot open browser. Please check if a browser app is installed.',
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to connect: ${e.toString()}'),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _disconnect() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Disconnect Razorpay?'),
        content: const Text(
          'Payments will no longer be automatically routed to your Razorpay account. '
          'You can reconnect anytime.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: AppTheme.error),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _disconnecting = true);
    try {
      await ApiService.post('/partner/disconnect', {});
      if (!mounted) return;
      await context.read<AuthProvider>().refreshProfile();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Razorpay account disconnected')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _disconnecting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final merchant = context.watch<AuthProvider>().merchant;
    final isLinked = merchant?.isRazorpayLinked ?? false;
    final linkedAccountId = merchant?.razorpayLinkedAccountId;

    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Razorpay Connect'),
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF528FF0), Color(0xFF3b6fd4)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.account_balance,
                      color: Colors.white,
                      size: 32,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    isLinked
                        ? 'Razorpay Connected ✓'
                        : 'Connect Your Razorpay Account',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    isLinked
                        ? 'Payments are automatically routed to your account'
                        : 'Enable automatic payment settlements directly to your account',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.85),
                      fontSize: 13,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),

            const SizedBox(height: 28),

            if (isLinked) ...[
              // Connected state
              _infoCard(
                icon: Icons.check_circle,
                iconColor: Colors.green,
                title: 'Account Linked',
                subtitle: linkedAccountId ?? 'Razorpay account connected',
              ),
              const SizedBox(height: 12),
              _infoCard(
                icon: Icons.flash_on,
                iconColor: AppTheme.primary,
                title: 'Instant Settlements',
                subtitle:
                    'Payments are transferred to your account automatically after capture',
              ),
              const SizedBox(height: 12),
              _infoCard(
                icon: Icons.percent,
                iconColor: Colors.orange,
                title: 'Commission Applied',
                subtitle: 'ISS platform commission is deducted before transfer',
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton.icon(
                  onPressed: _disconnecting ? null : _disconnect,
                  icon: _disconnecting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.link_off),
                  label: Text(
                    _disconnecting ? 'Disconnecting...' : 'Disconnect Account',
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.error,
                    side: BorderSide(color: AppTheme.error),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
            ] else ...[
              // Not connected state — benefits
              const Text(
                'Why connect?',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
              const SizedBox(height: 12),
              _benefitTile(
                icon: Icons.bolt,
                title: 'Instant Settlements',
                desc:
                    'Get paid instantly after every customer payment — no waiting',
              ),
              _benefitTile(
                icon: Icons.account_balance_wallet,
                title: 'Direct to Your Account',
                desc:
                    'Money goes straight to your Razorpay account, minus platform fee',
              ),
              _benefitTile(
                icon: Icons.auto_fix_high,
                title: 'Automatic Commission',
                desc:
                    'ISS platform commission is split automatically — no manual work',
              ),
              _benefitTile(
                icon: Icons.security,
                title: 'Secure OAuth',
                desc:
                    'Industry-standard OAuth 2.0 — we never store your Razorpay credentials',
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton.icon(
                  onPressed: _loading ? null : _connectRazorpay,
                  icon: _loading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Icon(Icons.link),
                  label: Text(
                    _loading ? 'Opening Razorpay...' : 'Connect with Razorpay',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 0,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Center(
                child: Text(
                  'You will be redirected to Razorpay to authorize access',
                  style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _infoCard({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8),
        ],
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor, size: 28),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _benefitTile({
    required IconData icon,
    required String title,
    required String desc,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: AppTheme.primary, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  desc,
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
