import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';

class AdminGatewayScreen extends StatefulWidget {
  const AdminGatewayScreen({super.key});

  @override
  State<AdminGatewayScreen> createState() => _AdminGatewayScreenState();
}

class _AdminGatewayScreenState extends State<AdminGatewayScreen> {
  bool _isLoading = true;
  List<dynamic> _gateways = [];
  String _activeGateway = '';
  bool _isSwitching = false;
  final Map<String, bool> _testingGateways = {};
  final Map<String, bool?> _statusResults =
      {}; // null=unknown, true=ok, false=fail

  @override
  void initState() {
    super.initState();
    _loadGateways();
  }

  Future<void> _loadGateways() async {
    setState(() => _isLoading = true);
    try {
      final response = await ApiService.get('/admin/gateways');
      if (response['success'] == true) {
        setState(() {
          _gateways = response['data']['gateways'] as List<dynamic>;
          _activeGateway = response['data']['activeGateway'] as String;
        });
      } else {
        _showError(response['message'] as String? ?? 'Failed to load gateways');
      }
    } catch (e) {
      _showError('Error loading gateways: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _switchGateway(String gateway, String displayName) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.swap_horiz_rounded,
                color: Colors.orange,
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            const Text(
              'Switch Gateway',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Activate $displayName as the payment gateway?',
              style: const TextStyle(fontSize: 14, color: Color(0xFF334155)),
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.amber.shade200),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: Colors.amber, size: 16),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'All new payments will go through this gateway immediately.',
                      style: TextStyle(fontSize: 12, color: Color(0xFF78350F)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: const Text('Yes, Switch'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _isSwitching = true);
    try {
      final response = await ApiService.post('/admin/gateways/switch', {
        'gateway': gateway,
      });

      if (response['success'] == true) {
        setState(() {
          _activeGateway = gateway;
          for (final gw in _gateways) {
            (gw as Map<String, dynamic>)['isActive'] = gw['name'] == gateway;
          }
        });
        _showSuccess('Switched to $displayName successfully');
      } else {
        _showError(
          response['message'] as String? ?? 'Failed to switch gateway',
        );
      }
    } catch (e) {
      _showError('Error switching gateway: $e');
    } finally {
      if (mounted) setState(() => _isSwitching = false);
    }
  }

  Future<void> _checkStatus(String gateway) async {
    setState(() {
      _testingGateways[gateway] = true;
      _statusResults[gateway] = null;
    });
    try {
      final response = await ApiService.post('/admin/gateways/test', {
        'gateway': gateway,
      });

      if (response['success'] == true) {
        final result = response['data'] as Map<String, dynamic>;
        final ok = result['success'] == true;
        setState(() => _statusResults[gateway] = ok);
        if (ok) {
          _showSuccess('${gateway.toUpperCase()} is reachable and working');
        } else {
          _showError(
            '${gateway.toUpperCase()} check failed: ${result['message']}',
          );
        }
      } else {
        setState(() => _statusResults[gateway] = false);
        _showError(response['message'] as String? ?? 'Check failed');
      }
    } catch (e) {
      setState(() => _statusResults[gateway] = false);
      _showError('Error checking status: $e');
    } finally {
      if (mounted) setState(() => _testingGateways[gateway] = false);
    }
  }

  void _showSuccess(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: Colors.green.shade600,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: Colors.red.shade600,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        title: const Text(
          'Payment Gateway',
          style: TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
        ),
        backgroundColor: AppTheme.primaryDark,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadGateways,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // ── Active gateway hero card ──────────────────────
                  _buildActiveHeroCard(),
                  const SizedBox(height: 20),

                  // ── Section title ─────────────────────────────────
                  const Padding(
                    padding: EdgeInsets.only(left: 4, bottom: 12),
                    child: Text(
                      'Available Gateways',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF64748B),
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),

                  // ── Gateway cards ─────────────────────────────────
                  for (final gateway in _gateways)
                    _buildGatewayCard(gateway as Map<String, dynamic>),

                  const SizedBox(height: 12),

                  // ── Info note ─────────────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.blue.shade100),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.info_outline,
                          color: Colors.blue.shade400,
                          size: 18,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Only one gateway is active at a time. '
                            'Switching takes effect immediately for all new payments. '
                            'Use "Check Status" to verify gateway connectivity.',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.blue.shade800,
                              height: 1.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildActiveHeroCard() {
    final name = _activeGateway;
    final displayName = name.isEmpty
        ? '—'
        : name[0].toUpperCase() + name.substring(1);
    final isRazorpay = name == 'razorpay';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isRazorpay
              ? [const Color(0xFF1A237E), const Color(0xFF3949AB)]
              : [const Color(0xFF1B5E20), const Color(0xFF388E3C)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: (isRazorpay ? Colors.indigo : Colors.green).withValues(
              alpha: 0.35,
            ),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              isRazorpay
                  ? Icons.payment_rounded
                  : Icons.account_balance_rounded,
              color: Colors.white,
              size: 28,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Active Gateway',
                  style: TextStyle(
                    color: Colors.white60,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  displayName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withValues(alpha: 0.4)),
            ),
            child: const Row(
              children: [
                Icon(Icons.circle, color: Colors.greenAccent, size: 8),
                SizedBox(width: 6),
                Text(
                  'LIVE',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGatewayCard(Map<String, dynamic> gateway) {
    final name = gateway['name'] as String;
    final displayName = gateway['displayName'] as String;
    final isActive = gateway['isActive'] as bool;
    final isTesting = _testingGateways[name] ?? false;
    final statusResult = _statusResults[name]; // null/true/false
    final isRazorpay = name == 'razorpay';

    final primaryColor = isRazorpay
        ? const Color(0xFF3949AB)
        : const Color(0xFF2E7D32);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isActive
              ? primaryColor.withValues(alpha: 0.5)
              : const Color(0xFFE2E8F0),
          width: isActive ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // ── Card header ────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                // Gateway logo area
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: isActive
                        ? primaryColor.withValues(alpha: 0.1)
                        : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    isRazorpay
                        ? Icons.payment_rounded
                        : Icons.account_balance_rounded,
                    color: isActive ? primaryColor : const Color(0xFF94A3B8),
                    size: 26,
                  ),
                ),
                const SizedBox(width: 14),

                // Name + status
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: isActive
                              ? primaryColor
                              : const Color(0xFF1E293B),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          // Online/offline dot
                          Container(
                            width: 7,
                            height: 7,
                            decoration: BoxDecoration(
                              color: isActive
                                  ? Colors.green.shade500
                                  : const Color(0xFFCBD5E1),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            isActive ? 'Active' : 'Inactive',
                            style: TextStyle(
                              fontSize: 12,
                              color: isActive
                                  ? Colors.green.shade600
                                  : const Color(0xFF94A3B8),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          // Status check result badge
                          if (statusResult != null) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: statusResult
                                    ? Colors.green.shade50
                                    : Colors.red.shade50,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    statusResult
                                        ? Icons.check_circle_outline
                                        : Icons.cancel_outlined,
                                    size: 11,
                                    color: statusResult
                                        ? Colors.green.shade600
                                        : Colors.red.shade600,
                                  ),
                                  const SizedBox(width: 3),
                                  Text(
                                    statusResult ? 'Reachable' : 'Unreachable',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                      color: statusResult
                                          ? Colors.green.shade700
                                          : Colors.red.shade700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),

                // Active badge
                if (isActive)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: primaryColor,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text(
                      'ACTIVE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // ── Divider ────────────────────────────────────────────
          const Divider(height: 1, color: Color(0xFFF1F5F9)),

          // ── Action buttons ─────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Row(
              children: [
                // Check Status button
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: isTesting ? null : () => _checkStatus(name),
                    icon: isTesting
                        ? SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: primaryColor,
                            ),
                          )
                        : Icon(
                            Icons.wifi_tethering_rounded,
                            size: 16,
                            color: primaryColor,
                          ),
                    label: Text(
                      isTesting ? 'Checking...' : 'Check Status',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: primaryColor,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      side: BorderSide(
                        color: primaryColor.withValues(alpha: 0.4),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                ),

                const SizedBox(width: 10),

                // Activate button
                Expanded(
                  child: isActive
                      ? OutlinedButton.icon(
                          onPressed: null,
                          icon: const Icon(
                            Icons.check_circle_rounded,
                            size: 16,
                          ),
                          label: const Text(
                            'Activated',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            foregroundColor: Colors.green.shade600,
                            side: BorderSide(color: Colors.green.shade200),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        )
                      : ElevatedButton.icon(
                          onPressed: _isSwitching
                              ? null
                              : () => _switchGateway(name, displayName),
                          icon: _isSwitching
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(
                                      Colors.white,
                                    ),
                                  ),
                                )
                              : const Icon(
                                  Icons.power_settings_new_rounded,
                                  size: 16,
                                ),
                          label: const Text(
                            'Activate',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            backgroundColor: Colors.orange.shade600,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
