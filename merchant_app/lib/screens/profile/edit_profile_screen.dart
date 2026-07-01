import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/services/api_service.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _bizNameCtrl = TextEditingController();
  final _websiteCtrl = TextEditingController();
  final _streetCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _stateCtrl = TextEditingController();
  final _pincodeCtrl = TextEditingController();
  String _category = 'other';
  bool _loading = false;
  bool _fetching = true;
  String? _error;

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
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [
      _bizNameCtrl,
      _websiteCtrl,
      _streetCtrl,
      _cityCtrl,
      _stateCtrl,
      _pincodeCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _fetching = true;
      _error = null;
    });
    try {
      final res = await ApiService.get('/merchant/profile');
      final data = res['data'] as Map<String, dynamic>;
      _bizNameCtrl.text = data['businessName'] ?? '';
      _websiteCtrl.text = data['website'] ?? '';
      final addr = data['businessAddress'] as Map<String, dynamic>? ?? {};
      _streetCtrl.text = addr['street'] ?? '';
      _cityCtrl.text = addr['city'] ?? '';
      _stateCtrl.text = addr['state'] ?? '';
      _pincodeCtrl.text = addr['pincode'] ?? '';
      setState(() {
        _category = data['businessCategory'] ?? 'other';
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Failed to load profile. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _fetching = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ApiService.put('/merchant/profile', {
        'businessName': _bizNameCtrl.text.trim(),
        'businessCategory': _category,
        if (_websiteCtrl.text.trim().isNotEmpty)
          'website': _websiteCtrl.text.trim(),
        'businessAddress': {
          'street': _streetCtrl.text.trim(),
          'city': _cityCtrl.text.trim(),
          'state': _stateCtrl.text.trim(),
          'pincode': _pincodeCtrl.text.trim(),
        },
      });
      if (!mounted) return;
      await context.read<AuthProvider>().refreshProfile();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile updated successfully')),
      );
      Navigator.pop(context);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Failed to update profile');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(title: const Text('Edit Profile')),
      body: _fetching
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _bizNameCtrl.text.isEmpty
          ? EmptyState(
              icon: Icons.wifi_off,
              title: 'Failed to load profile',
              subtitle: _error,
              onAction: _load,
              actionLabel: 'Retry',
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_error != null)
                      ErrorBanner(
                        message: _error!,
                        onDismiss: () => setState(() => _error = null),
                      ),
                    if (_error != null) const SizedBox(height: 12),

                    const Text(
                      'Business Details',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textSecondary,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 12),

                    AppTextField(
                      controller: _bizNameCtrl,
                      label: 'Business Name',
                      prefixIcon: Icons.store_outlined,
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 14),
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
                    const SizedBox(height: 14),
                    AppTextField(
                      controller: _websiteCtrl,
                      label: 'Website (optional)',
                      hint: 'https://yourbusiness.com',
                      prefixIcon: Icons.language_outlined,
                      keyboardType: TextInputType.url,
                    ),
                    const SizedBox(height: 24),

                    const Text(
                      'Business Address',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textSecondary,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 12),
                    AppTextField(
                      controller: _streetCtrl,
                      label: 'Street Address',
                      prefixIcon: Icons.location_on_outlined,
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: AppTextField(
                            controller: _cityCtrl,
                            label: 'City',
                            prefixIcon: Icons.location_city_outlined,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: AppTextField(
                            controller: _stateCtrl,
                            label: 'State',
                            prefixIcon: Icons.map_outlined,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    AppTextField(
                      controller: _pincodeCtrl,
                      label: 'Pincode',
                      prefixIcon: Icons.pin_drop_outlined,
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        if (v != null &&
                            v.isNotEmpty &&
                            !RegExp(r'^\d{6}$').hasMatch(v)) {
                          return 'Invalid pincode';
                        }
                        return null;
                      },
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
                        label: const Text('Save Changes'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
