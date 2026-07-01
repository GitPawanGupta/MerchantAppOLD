import 'package:flutter/material.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey    = GlobalKey<FormState>();
  final _currCtrl   = TextEditingController();
  final _newCtrl    = TextEditingController();
  final _conf2Ctrl  = TextEditingController();
  bool _showCurr    = false;
  bool _showNew     = false;
  bool _loading     = false;
  String? _error;

  @override
  void dispose() {
    _currCtrl.dispose(); _newCtrl.dispose(); _conf2Ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });
    try {
      await AuthService.changePassword(_currCtrl.text, _newCtrl.text);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Password changed successfully')));
        Navigator.pop(context);
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Failed to change password');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(title: const Text('Change Password')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              if (_error != null)
                ErrorBanner(message: _error!, onDismiss: () => setState(() => _error = null)),
              if (_error != null) const SizedBox(height: 12),

              AppTextField(
                controller: _currCtrl,
                label: 'Current Password',
                prefixIcon: Icons.lock_outline,
                obscure: !_showCurr,
                suffix: IconButton(
                  icon: Icon(_showCurr ? Icons.visibility_off : Icons.visibility,
                      size: 20, color: AppTheme.textSecondary),
                  onPressed: () => setState(() => _showCurr = !_showCurr),
                ),
                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              AppTextField(
                controller: _newCtrl,
                label: 'New Password',
                prefixIcon: Icons.lock_outline,
                obscure: !_showNew,
                suffix: IconButton(
                  icon: Icon(_showNew ? Icons.visibility_off : Icons.visibility,
                      size: 20, color: AppTheme.textSecondary),
                  onPressed: () => setState(() => _showNew = !_showNew),
                ),
                validator: (v) {
                  if (v == null || v.length < 8) return 'Min 8 characters';
                  if (!RegExp(r'(?=.*[A-Z])(?=.*[a-z])(?=.*\d)').hasMatch(v)) {
                    return 'Must include upper, lower & number';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              AppTextField(
                controller: _conf2Ctrl,
                label: 'Confirm New Password',
                prefixIcon: Icons.lock_outline,
                obscure: true,
                validator: (v) =>
                    v != _newCtrl.text ? 'Passwords do not match' : null,
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(height: 18, width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Update Password'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
