import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/services/api_service.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class BankDetailsScreen extends StatefulWidget {
  const BankDetailsScreen({super.key});
  @override
  State<BankDetailsScreen> createState() => _BankDetailsScreenState();
}

class _BankDetailsScreenState extends State<BankDetailsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _holderCtrl = TextEditingController();
  final _accountCtrl = TextEditingController();
  final _ifscCtrl = TextEditingController();
  final _bankNameCtrl = TextEditingController();
  String _accountType = 'current';
  bool _loading = false;
  bool _fetching = true;
  bool _verifyingIFSC = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadExisting();
  }

  @override
  void dispose() {
    // curly_braces_in_flow_control_structures fixed — using block body
    for (final c in [_holderCtrl, _accountCtrl, _ifscCtrl, _bankNameCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadExisting() async {
    setState(() {
      _fetching = true;
      _error = null;
    });
    try {
      final res = await ApiService.get('/merchant/bank-details');
      final data = res['data'];
      if (data != null) {
        _holderCtrl.text = data['accountHolderName'] ?? '';
        _accountCtrl.text = data['accountNumber'] ?? '';
        _ifscCtrl.text = data['ifscCode'] ?? '';
        _bankNameCtrl.text = data['bankName'] ?? '';
        setState(() => _accountType = data['accountType'] ?? 'current');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Failed to load bank details. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _fetching = false);
    }
  }

  Future<void> _verifyIFSC() async {
    final ifsc = _ifscCtrl.text.trim().toUpperCase();
    if (ifsc.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter an IFSC code first')),
      );
      return;
    }
    if (!RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$').hasMatch(ifsc)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid IFSC code format')),
      );
      return;
    }

    setState(() {
      _verifyingIFSC = true;
      _error = null;
    });

    try {
      final res = await ApiService.get('/merchant/verify-ifsc?ifsc=$ifsc');
      final data = res['data'];
      if (data != null && data['isValid'] == true) {
        _bankNameCtrl.text = data['bankName'] ?? '';
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'IFSC Verified: ${data['bankName']} (${data['branch'] ?? ''})',
            ),
            backgroundColor: AppTheme.accent,
          ),
        );
      } else {
        setState(() => _error = 'Invalid IFSC code');
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Failed to verify IFSC');
    } finally {
      if (mounted) {
        setState(() => _verifyingIFSC = false);
      }
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ApiService.post('/merchant/bank-details', {
        'accountHolderName': _holderCtrl.text.trim(),
        'accountNumber': _accountCtrl.text.trim(),
        'ifscCode': _ifscCtrl.text.trim().toUpperCase(),
        'bankName': _bankNameCtrl.text.trim(),
        'accountType': _accountType,
      });
      // use_build_context_synchronously fixed — check mounted before using context
      if (!mounted) return;
      await context.read<AuthProvider>().refreshProfile();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Bank details saved')));
      Navigator.pop(context);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Failed to save bank details');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(title: const Text('Bank Details')),
      body: _fetching
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _holderCtrl.text.isEmpty
          ? EmptyState(
              icon: Icons.wifi_off,
              title: 'Failed to load bank details',
              subtitle: _error,
              onAction: _loadExisting,
              actionLabel: 'Retry',
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppTheme.info.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: AppTheme.info.withValues(alpha: 0.2),
                        ),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.security, color: AppTheme.info, size: 20),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Bank details are used for settlements. '
                              'Ensure the account belongs to your registered business.',
                              style: TextStyle(
                                fontSize: 13,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_error != null)
                      ErrorBanner(
                        message: _error!,
                        onDismiss: () => setState(() => _error = null),
                      ),
                    if (_error != null) const SizedBox(height: 12),
                    AppTextField(
                      controller: _holderCtrl,
                      label: 'Account Holder Name',
                      prefixIcon: Icons.person_outline,
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      controller: _accountCtrl,
                      label: 'Account Number',
                      prefixIcon: Icons.credit_card_outlined,
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Required';
                        if (v.length < 9 || v.length > 18) {
                          return 'Invalid account number';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      controller: _ifscCtrl,
                      label: 'IFSC Code',
                      hint: 'SBIN0001234',
                      prefixIcon: Icons.confirmation_number_outlined,
                      suffix: _verifyingIFSC
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: Padding(
                                padding: EdgeInsets.all(12),
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppTheme.primary,
                                ),
                              ),
                            )
                          : TextButton(
                              onPressed: _verifyIFSC,
                              child: const Text('Verify'),
                            ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Required';
                        if (!RegExp(
                          r'^[A-Z]{4}0[A-Z0-9]{6}$',
                        ).hasMatch(v.toUpperCase())) {
                          return 'Invalid IFSC code';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      controller: _bankNameCtrl,
                      label: 'Bank Name',
                      hint: 'State Bank of India',
                      prefixIcon: Icons.account_balance_outlined,
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Account Type',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: ['current', 'savings']
                          .map(
                            (t) => Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: ChoiceChip(
                                  label: Center(
                                    child: Text(
                                      t[0].toUpperCase() + t.substring(1),
                                    ),
                                  ),
                                  selected: _accountType == t,
                                  selectedColor: AppTheme.primary.withValues(
                                    alpha: 0.15,
                                  ),
                                  onSelected: (_) =>
                                      setState(() => _accountType = t),
                                ),
                              ),
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 32),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: _loading ? null : _submit,
                        icon: _loading
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.save_outlined),
                        label: const Text('Save Bank Details'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
