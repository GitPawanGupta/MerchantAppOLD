import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _bizCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _pass2Ctrl = TextEditingController();
  bool _showPass = false;
  String _category = 'other';

  static const _categories = [
    'retail',
    'restaurant',
    'grocery',
    'healthcare',
    'education',
    'services',
    'ecommerce',
    'travel',
    'entertainment',
    'utility',
    'other',
  ];

  @override
  void dispose() {
    for (final c in [
      _nameCtrl,
      _emailCtrl,
      _phoneCtrl,
      _bizCtrl,
      _passCtrl,
      _pass2Ctrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = context.read<AuthProvider>();
    auth.clearError();
    final ok = await auth.register(
      name: _nameCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      phone: _phoneCtrl.text.trim(),
      password: _passCtrl.text,
      businessName: _bizCtrl.text.trim().isEmpty ? null : _bizCtrl.text.trim(),
    );
    if (ok && mounted) Navigator.pushReplacementNamed(context, '/home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(
        title: const Text('Create Account'),
        leading: const BackButton(),
      ),
      body: Consumer<AuthProvider>(
        // single underscore — unnecessary_underscores fixed
        builder: (_, auth, _) => LoadingOverlay(
          isLoading: auth.isLoading,
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Personal Details',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textSecondary,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (auth.error != null)
                    ErrorBanner(
                      message: auth.error!,
                      onDismiss: auth.clearError,
                    ),
                  if (auth.error != null) const SizedBox(height: 12),
                  AppTextField(
                    controller: _nameCtrl,
                    label: 'Full Name',
                    prefixIcon: Icons.person_outline,
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? 'Name required'
                        : null,
                  ),
                  const SizedBox(height: 14),
                  AppTextField(
                    controller: _emailCtrl,
                    label: 'Email',
                    hint: 'you@example.com',
                    prefixIcon: Icons.email_outlined,
                    keyboardType: TextInputType.emailAddress,
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Email required';
                      if (!v.contains('@')) return 'Enter valid email';
                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                  AppTextField(
                    controller: _phoneCtrl,
                    label: 'Mobile Number',
                    hint: '9XXXXXXXXX',
                    prefixIcon: Icons.phone_outlined,
                    keyboardType: TextInputType.phone,
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Phone required';
                      if (!RegExp(r'^[6-9]\d{9}$').hasMatch(v)) {
                        return 'Enter valid 10-digit mobile number';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Business Details',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textSecondary,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    controller: _bizCtrl,
                    label: 'Business Name (optional)',
                    prefixIcon: Icons.store_outlined,
                  ),
                  const SizedBox(height: 14),
                  // initialValue replaces deprecated 'value'
                  DropdownButtonFormField<String>(
                    initialValue: _category,
                    style: const TextStyle(
                      color: Color(0xFF0F172A),
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                    dropdownColor: AppTheme.surface,
                    decoration: const InputDecoration(
                      labelText: 'Business Category',
                      prefixIcon: Icon(Icons.category_outlined, size: 20),
                    ),
                    items: _categories
                        .map(
                          (c) => DropdownMenuItem(
                            value: c,
                            child: Text(c[0].toUpperCase() + c.substring(1)),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => setState(() => _category = v!),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Security',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textSecondary,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    controller: _passCtrl,
                    label: 'Password',
                    prefixIcon: Icons.lock_outline,
                    obscure: !_showPass,
                    suffix: IconButton(
                      icon: Icon(
                        _showPass ? Icons.visibility_off : Icons.visibility,
                        size: 20,
                        color: AppTheme.textSecondary,
                      ),
                      onPressed: () => setState(() => _showPass = !_showPass),
                    ),
                    validator: (v) {
                      if (v == null || v.length < 8) return 'Min 8 characters';
                      if (!RegExp(
                        r'(?=.*[A-Z])(?=.*[a-z])(?=.*\d)',
                      ).hasMatch(v)) {
                        return 'Must include upper, lower & number';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                  AppTextField(
                    controller: _pass2Ctrl,
                    label: 'Confirm Password',
                    prefixIcon: Icons.lock_outline,
                    obscure: true,
                    validator: (v) =>
                        v != _passCtrl.text ? 'Passwords do not match' : null,
                  ),
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: auth.isLoading ? null : _submit,
                      child: const Text('Create Account'),
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
