import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class CreateDynamicQRScreen extends StatefulWidget {
  const CreateDynamicQRScreen({super.key});
  @override
  State<CreateDynamicQRScreen> createState() => _CreateDynamicQRScreenState();
}

class _CreateDynamicQRScreenState extends State<CreateDynamicQRScreen> {
  final _formKey = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _labelCtrl = TextEditingController();
  int _expiryMinutes = 30;
  bool _loading = false;
  String? _error;

  final _expiryOptions = const [5, 15, 30, 60, 120, 240, 480, 1440];

  @override
  void dispose() {
    _amountCtrl.dispose();
    _labelCtrl.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ApiService.post('/qr/dynamic', {
        'amount': double.parse(_amountCtrl.text.trim()),
        if (_labelCtrl.text.trim().isNotEmpty) 'label': _labelCtrl.text.trim(),
        'expiresInMinutes': _expiryMinutes,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Dynamic QR created successfully')),
        );
        Navigator.pop(context);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Failed to create QR');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _expiryLabel(int m) {
    if (m < 60) return '$m min';
    if (m == 60) return '1 hr';
    if (m < 1440) return '${m ~/ 60} hrs';
    return '1 day';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(title: const Text('Create Dynamic QR')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.accent.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppTheme.accent.withValues(alpha: 0.2),
                  ),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.flash_on, color: AppTheme.accent, size: 20),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Dynamic QR codes are for a specific amount and expire '
                        'after the set duration. Great for billing.',
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
                controller: _amountCtrl,
                label: 'Amount (₹)',
                hint: '500.00',
                prefixIcon: Icons.currency_rupee,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                validator: (v) {
                  if (v == null || v.isEmpty) return 'Amount required';
                  final d = double.tryParse(v);
                  if (d == null || d < 1) return 'Enter valid amount (min ₹1)';
                  return null;
                },
              ),
              const SizedBox(height: 16),
              AppTextField(
                controller: _labelCtrl,
                label: 'Label (optional)',
                hint: 'e.g. Invoice #1234',
                prefixIcon: Icons.label_outline,
              ),
              const SizedBox(height: 16),
              const Text(
                'Expiry Duration',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _expiryOptions
                    .map(
                      (m) => ChoiceChip(
                        label: Text(_expiryLabel(m)),
                        selected: _expiryMinutes == m,
                        selectedColor: AppTheme.primary.withValues(alpha: 0.15),
                        labelStyle: TextStyle(
                          color: _expiryMinutes == m
                              ? AppTheme.primary
                              : AppTheme.textSecondary,
                          fontWeight: _expiryMinutes == m
                              ? FontWeight.w700
                              : FontWeight.normal,
                        ),
                        onSelected: (_) => setState(() => _expiryMinutes = m),
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: _loading ? null : _create,
                  icon: _loading
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.flash_on),
                  label: const Text('Generate Dynamic QR'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
