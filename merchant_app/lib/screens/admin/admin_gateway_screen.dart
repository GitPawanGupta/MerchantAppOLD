import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';

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

  Future<void> _switchGateway(String gateway) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Switch Payment Gateway'),
        content: Text(
          'Are you sure you want to switch to ${gateway.toUpperCase()}?\n\n'
          'All new payments will be processed through this gateway.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            child: const Text('Switch Gateway'),
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
        _showSuccess('Payment gateway switched to ${gateway.toUpperCase()}');
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

  Future<void> _testGateway(String gateway) async {
    setState(() => _testingGateways[gateway] = true);
    try {
      final response = await ApiService.post('/admin/gateways/test', {
        'gateway': gateway,
      });

      if (response['success'] == true) {
        final result = response['data'] as Map<String, dynamic>;
        if (result['success'] == true) {
          _showSuccess(
            '${(result['gateway'] as String).toUpperCase()} connection successful!',
          );
        } else {
          _showError(
            '${(result['gateway'] as String).toUpperCase()} test failed: ${result['message']}',
          );
        }
      } else {
        _showError(response['message'] as String? ?? 'Test failed');
      }
    } catch (e) {
      _showError('Error testing gateway: $e');
    } finally {
      if (mounted) setState(() => _testingGateways[gateway] = false);
    }
  }

  void _showSuccess(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment Gateway Settings'),
        backgroundColor: Colors.indigo,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadGateways,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Info card
                  Card(
                    color: Colors.blue.shade50,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline, color: Colors.blue.shade700),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Select which payment gateway to use for '
                              'processing transactions. Only one gateway '
                              'can be active at a time.',
                              style: TextStyle(
                                color: Colors.blue.shade900,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Active gateway indicator
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.green.shade200),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.check_circle,
                          color: Colors.green.shade700,
                          size: 28,
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Currently Active',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.black54,
                              ),
                            ),
                            Text(
                              _activeGateway.toUpperCase(),
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: Colors.green.shade900,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  const Text(
                    'Available Payment Gateways',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),

                  for (final gateway in _gateways)
                    _buildGatewayCard(gateway as Map<String, dynamic>),
                ],
              ),
            ),
    );
  }

  Widget _buildGatewayCard(Map<String, dynamic> gateway) {
    final name = gateway['name'] as String;
    final displayName = gateway['displayName'] as String;
    final isActive = gateway['isActive'] as bool;
    final isTesting = _testingGateways[name] ?? false;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: isActive ? 4 : 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isActive ? Colors.green.shade300 : Colors.grey.shade200,
          width: isActive ? 2 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Gateway icon
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: isActive
                        ? Colors.green.shade100
                        : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    name == 'razorpay' ? Icons.payment : Icons.account_balance,
                    color: isActive
                        ? Colors.green.shade700
                        : Colors.grey.shade600,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),

                // Gateway name and status
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: isActive ? Colors.green : Colors.grey,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            isActive ? 'Active' : 'Inactive',
                            style: TextStyle(
                              fontSize: 13,
                              color: isActive
                                  ? Colors.green.shade700
                                  : Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // Active badge
                if (isActive)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.green.shade100,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      'ACTIVE',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Colors.green.shade900,
                      ),
                    ),
                  ),
              ],
            ),

            const SizedBox(height: 16),

            // Action buttons
            Row(
              children: [
                // Test connection button
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: isTesting ? null : () => _testGateway(name),
                    icon: isTesting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.wifi_tethering, size: 18),
                    label: Text(isTesting ? 'Checking...' : 'Check Status'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.blue,
                      side: const BorderSide(color: Colors.blue),
                    ),
                  ),
                ),

                const SizedBox(width: 12),

                // Activate button
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: (isActive || _isSwitching)
                        ? null
                        : () => _switchGateway(name),
                    icon: (_isSwitching && !isActive)
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          )
                        : const Icon(Icons.power_settings_new, size: 18),
                    label: Text(isActive ? 'Active' : 'Activate'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isActive ? Colors.green : Colors.orange,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
