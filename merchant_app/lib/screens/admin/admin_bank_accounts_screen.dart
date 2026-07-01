import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/services/api_service.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/models/bank_account_model.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class AdminBankAccountsScreen extends StatefulWidget {
  const AdminBankAccountsScreen({super.key});
  @override
  State<AdminBankAccountsScreen> createState() =>
      _AdminBankAccountsScreenState();
}

class _AdminBankAccountsScreenState extends State<AdminBankAccountsScreen> {
  List<BankAccountModel> _accounts = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiService.get('/admin/bank-accounts');
      final list = (res['data'] as List)
          .map((e) => BankAccountModel.fromJson(e))
          .toList();
      setState(() {
        _accounts = list;
        _error = null;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Failed to load admin bank accounts');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setPrimary(String id) async {
    final messenger = ScaffoldMessenger.of(context);
    final auth = context.read<AuthProvider>();

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Set as Primary?'),
        content: const Text(
          'This account will be designated as the primary account for settlements.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            ),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );

    if (ok != true) return;

    setState(() => _loading = true);
    try {
      await ApiService.post('/admin/bank-accounts/$id/primary', {});
      messenger.showSnackBar(
        const SnackBar(content: Text('Primary account updated')),
      );
      await auth.refreshProfile();
      _fetch();
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppTheme.error),
      );
      setState(() => _loading = false);
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Failed to update primary account'),
          backgroundColor: AppTheme.error,
        ),
      );
      setState(() => _loading = false);
    }
  }

  Future<void> _deleteAccount(String id) async {
    final messenger = ScaffoldMessenger.of(context);
    final auth = context.read<AuthProvider>();

    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete Account?'),
        content: const Text(
          'Are you sure you want to remove this bank account?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.error,
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (ok != true) return;

    setState(() => _loading = true);
    try {
      await ApiService.delete('/admin/bank-accounts/$id');
      messenger.showSnackBar(
        const SnackBar(content: Text('Bank account deleted')),
      );
      await auth.refreshProfile();
      _fetch();
    } on ApiException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppTheme.error),
      );
      setState(() => _loading = false);
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Failed to delete bank account'),
          backgroundColor: AppTheme.error,
        ),
      );
      setState(() => _loading = false);
    }
  }

  void _showAddDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _AddAccountBottomSheet(),
    ).then((val) {
      if (val == true) _fetch();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(title: const Text('Admin Bank Accounts')),
      body: _loading && _accounts.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? EmptyState(
              icon: Icons.wifi_off,
              title: 'Error',
              subtitle: _error,
              onAction: _fetch,
              actionLabel: 'Retry',
            )
          : RefreshIndicator(
              onRefresh: _fetch,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppTheme.info.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppTheme.info.withValues(alpha: 0.2),
                      ),
                    ),
                    child: const Row(
                      children: [
                        Icon(
                          Icons.info_outline,
                          color: AppTheme.info,
                          size: 20,
                        ),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'Commissions settled manually can be transferred to any of your configured bank accounts.',
                            style: TextStyle(
                              fontSize: 12,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (_accounts.isEmpty)
                    const EmptyState(
                      icon: Icons.account_balance_outlined,
                      title: 'No accounts configured',
                      subtitle:
                          'Add a bank account to receive admin commission settlements.',
                    )
                  else
                    ..._accounts.map(
                      (acc) => _AccountCard(
                        account: acc,
                        onMakePrimary: () => _setPrimary(acc.id),
                        onDelete: () => _deleteAccount(acc.id),
                      ),
                    ),
                ],
              ),
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddDialog,
        backgroundColor: AppTheme.primary,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('Add Account', style: TextStyle(color: Colors.white)),
      ),
    );
  }
}

class _AccountCard extends StatelessWidget {
  final BankAccountModel account;
  final VoidCallback onMakePrimary;
  final VoidCallback onDelete;

  const _AccountCard({
    required this.account,
    required this.onMakePrimary,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final isPrimary = account.isPrimary;
    const accentColor = AppTheme.primary;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isPrimary
              ? AppTheme.primary.withValues(alpha: 0.4)
              : const Color(0xFFE8EEF4),
          width: isPrimary ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header ──────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
            decoration: BoxDecoration(
              gradient: isPrimary
                  ? AppTheme.headerGradient
                  : const LinearGradient(
                      colors: [Color(0xFFF8FAFC), Color(0xFFF1F5F9)],
                    ),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: isPrimary
                        ? Colors.white.withValues(alpha: 0.2)
                        : AppTheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.account_balance_rounded,
                    color: isPrimary ? Colors.white : AppTheme.primary,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        account.bankName.isNotEmpty
                            ? account.bankName
                            : 'Bank Account',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                          color: isPrimary
                              ? Colors.white
                              : AppTheme.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        account.accountHolderName,
                        style: TextStyle(
                          fontSize: 12,
                          color: isPrimary
                              ? Colors.white70
                              : AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isPrimary)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.4),
                      ),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.star_rounded, size: 10, color: Colors.white),
                        SizedBox(width: 3),
                        Text(
                          'PRIMARY',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          // ── Details ──────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
            child: Column(
              children: [
                // Account Number + IFSC row
                Row(
                  children: [
                    Expanded(
                      child: _InfoChip(
                        label: 'ACCOUNT NO.',
                        value: account.accountNumber.isNotEmpty
                            ? account.accountNumber
                            : '—',
                        icon: Icons.credit_card_outlined,
                        accentColor: accentColor,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _InfoChip(
                        label: 'IFSC',
                        value: account.ifscCode.isNotEmpty
                            ? account.ifscCode
                            : '—',
                        icon: Icons.confirmation_number_outlined,
                        accentColor: accentColor,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Account type + actions row
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: accentColor.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: accentColor.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Text(
                        account.accountType.toUpperCase(),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: accentColor,
                        ),
                      ),
                    ),
                    const Spacer(),
                    if (!isPrimary) ...[
                      TextButton.icon(
                        onPressed: onMakePrimary,
                        icon: const Icon(Icons.star_outline_rounded, size: 14),
                        label: const Text(
                          'Set Primary',
                          style: TextStyle(fontSize: 12),
                        ),
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          foregroundColor: AppTheme.primary,
                        ),
                      ),
                      const SizedBox(width: 4),
                      IconButton(
                        icon: const Icon(
                          Icons.delete_outline_rounded,
                          color: AppTheme.error,
                          size: 20,
                        ),
                        onPressed: onDelete,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                          minWidth: 32,
                          minHeight: 32,
                        ),
                        tooltip: 'Remove account',
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Small info chip ───────────────────────────────────────────────────────────
class _InfoChip extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color accentColor;

  const _InfoChip({
    required this.label,
    required this.value,
    required this.icon,
    required this.accentColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTheme.bgLight,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 10, color: accentColor),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: accentColor,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: AppTheme.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddAccountBottomSheet extends StatefulWidget {
  const _AddAccountBottomSheet();
  @override
  State<_AddAccountBottomSheet> createState() => _AddAccountBottomSheetState();
}

class _AddAccountBottomSheetState extends State<_AddAccountBottomSheet> {
  final _formKey = GlobalKey<FormState>();
  final _holderCtrl = TextEditingController();
  final _accountCtrl = TextEditingController();
  final _ifscCtrl = TextEditingController();
  final _bankNameCtrl = TextEditingController();
  String _accountType = 'current';
  bool _loading = false;
  bool _verifyingIFSC = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_holderCtrl, _accountCtrl, _ifscCtrl, _bankNameCtrl]) {
      c.dispose();
    }
    super.dispose();
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
      final res = await ApiService.get('/admin/verify-ifsc?ifsc=$ifsc');
      final data = res['data'];
      if (data != null && data['isValid'] == true) {
        _bankNameCtrl.text = data['bankName'] ?? '';
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('IFSC Verified: ${data['bankName']}'),
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
      if (mounted) setState(() => _verifyingIFSC = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ApiService.post('/admin/bank-accounts', {
        'accountHolderName': _holderCtrl.text.trim(),
        'accountNumber': _accountCtrl.text.trim(),
        'ifscCode': _ifscCtrl.text.trim().toUpperCase(),
        'bankName': _bankNameCtrl.text.trim(),
        'accountType': _accountType,
      });
      if (!mounted) return;
      await context.read<AuthProvider>().refreshProfile();
      if (!mounted) return;
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Failed to save bank account');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(
        20,
        20,
        20,
        MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Add Admin Bank Account',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_error != null) ...[
                ErrorBanner(
                  message: _error!,
                  onDismiss: () => setState(() => _error = null),
                ),
                const SizedBox(height: 12),
              ],
              AppTextField(
                controller: _holderCtrl,
                label: 'Account Holder Name',
                prefixIcon: Icons.person_outline,
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _accountCtrl,
                label: 'Account Number',
                prefixIcon: Icons.credit_card_outlined,
                keyboardType: TextInputType.number,
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Required';
                  if (v.length < 9 || v.length > 18) return 'Invalid length';
                  return null;
                },
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _ifscCtrl,
                label: 'IFSC Code',
                hint: 'SBIN0001234',
                prefixIcon: Icons.confirmation_number_outlined,
                suffix: _verifyingIFSC
                    ? const SizedBox(
                        width: 20,
                        height: 20,
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
                    return 'Invalid format';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              AppTextField(
                controller: _bankNameCtrl,
                label: 'Bank Name',
                prefixIcon: Icons.account_balance_outlined,
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              const Text(
                'Account Type',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: ['current', 'savings']
                    .map(
                      (t) => Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Center(
                              child: Text(t[0].toUpperCase() + t.substring(1)),
                            ),
                            selected: _accountType == t,
                            selectedColor: AppTheme.primary.withValues(
                              alpha: 0.15,
                            ),
                            onSelected: (_) => setState(() => _accountType = t),
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 24),
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
                  label: const Text('Add Account'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
