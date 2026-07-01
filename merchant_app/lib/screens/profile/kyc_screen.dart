import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../core/services/api_service.dart';
import '../../core/providers/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/constants/app_constants.dart';

class KYCScreen extends StatefulWidget {
  const KYCScreen({super.key});
  @override
  State<KYCScreen> createState() => _KYCScreenState();
}

class _KYCScreenState extends State<KYCScreen> {
  final _formKey = GlobalKey<FormState>();
  final _panCtrl = TextEditingController();
  final _gstCtrl = TextEditingController();
  final _aadharCtrl = TextEditingController();
  String _bizType = 'individual';
  File? _panFile, _aadharFile, _gstFile;
  bool _loading = false;
  String? _error;

  static const _bizTypes = [
    'individual',
    'proprietorship',
    'partnership',
    'pvt_ltd',
    'ltd',
    'llp',
    'other',
  ];

  @override
  void dispose() {
    _panCtrl.dispose();
    _gstCtrl.dispose();
    _aadharCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickFile(String field) async {
    final picker = ImagePicker();
    final XFile? picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked != null) {
      final file = File(picked.path);
      setState(() {
        if (field == 'pan') {
          _panFile = file;
        } else if (field == 'aadhar') {
          _aadharFile = file;
        } else if (field == 'gst') {
          _gstFile = file;
        }
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final fields = <String, String>{
        'businessType': _bizType,
        if (_panCtrl.text.trim().isNotEmpty) 'panNumber': _panCtrl.text.trim(),
        if (_gstCtrl.text.trim().isNotEmpty) 'gstNumber': _gstCtrl.text.trim(),
        if (_aadharCtrl.text.trim().isNotEmpty)
          'aadharNumber': _aadharCtrl.text.trim(),
      };
      final files = <String, File>{
        // ignore: use_null_aware_elements
        if (_panFile != null) 'panDoc': _panFile!,
        // ignore: use_null_aware_elements
        if (_aadharFile != null) 'aadharDoc': _aadharFile!,
        // ignore: use_null_aware_elements
        if (_gstFile != null) 'gstDoc': _gstFile!,
      };
      await ApiService.postMultipart('/merchant/kyc', fields, files);

      // use_build_context_synchronously fixed — mounted check before context use
      if (!mounted) return;
      await context.read<AuthProvider>().refreshProfile();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('KYC submitted for review')));
      Navigator.pop(context);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Failed to submit KYC');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final merchant = context.watch<AuthProvider>().merchant;
    final kycStatus = merchant?.kycStatus ?? 'pending';
    final isApproved = kycStatus == 'approved';

    return Scaffold(
      backgroundColor: AppTheme.bgLight,
      appBar: AppBar(title: const Text('KYC Verification')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status banner
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Color(
                  AppConstants.kycStatusColor[kycStatus] ?? 0xFF94A3B8,
                ).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: Color(
                    AppConstants.kycStatusColor[kycStatus] ?? 0xFF94A3B8,
                  ).withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    isApproved ? Icons.verified : Icons.pending_outlined,
                    color: Color(
                      AppConstants.kycStatusColor[kycStatus] ?? 0xFF94A3B8,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'KYC Status: ${kycStatus.toUpperCase()}',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: Color(
                            AppConstants.kycStatusColor[kycStatus] ??
                                0xFF94A3B8,
                          ),
                        ),
                      ),
                      if (isApproved)
                        const Text(
                          'Your KYC is verified',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            if (isApproved)
              const EmptyState(
                icon: Icons.verified,
                title: 'KYC Approved',
                subtitle: 'Your business is fully verified',
              )
            else
              Form(
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

                    const _SectionLabel('Business Information'),
                    const SizedBox(height: 12),

                    // initialValue replaces deprecated 'value'
                    DropdownButtonFormField<String>(
                      initialValue: _bizType,
                      style: const TextStyle(
                        color: Color(0xFF0F172A),
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                      dropdownColor: AppTheme.surface,
                      decoration: const InputDecoration(
                        labelText: 'Business Type',
                        prefixIcon: Icon(Icons.business, size: 20),
                      ),
                      items: _bizTypes
                          .map(
                            (t) => DropdownMenuItem(
                              value: t,
                              child: Text(t.replaceAll('_', ' ').toUpperCase()),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => setState(() => _bizType = v!),
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      controller: _panCtrl,
                      label: 'PAN Number',
                      hint: 'ABCDE1234F',
                      prefixIcon: Icons.credit_card_outlined,
                      validator: (v) {
                        if (v != null &&
                            v.isNotEmpty &&
                            !RegExp(
                              r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
                            ).hasMatch(v.toUpperCase())) {
                          return 'Invalid PAN format';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      controller: _aadharCtrl,
                      label: 'Aadhaar Number',
                      hint: '123456789012',
                      prefixIcon: Icons.fingerprint,
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        if (v != null && v.isNotEmpty && v.length != 12) {
                          return 'Aadhaar must be 12 digits';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    AppTextField(
                      controller: _gstCtrl,
                      label: 'GST Number (optional)',
                      hint: '22ABCDE1234F1Z5',
                      prefixIcon: Icons.receipt_long_outlined,
                    ),
                    const SizedBox(height: 24),

                    const _SectionLabel('Documents'),
                    const SizedBox(height: 12),
                    _DocPicker(
                      label: 'PAN Card',
                      file: _panFile,
                      onPick: () => _pickFile('pan'),
                    ),
                    const SizedBox(height: 10),
                    _DocPicker(
                      label: 'Aadhaar Card',
                      file: _aadharFile,
                      onPick: () => _pickFile('aadhar'),
                    ),
                    const SizedBox(height: 10),
                    _DocPicker(
                      label: 'GST Certificate (optional)',
                      file: _gstFile,
                      onPick: () => _pickFile('gst'),
                    ),
                    const SizedBox(height: 32),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: _loading ? null : _submit,
                        child: _loading
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Submit KYC'),
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
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.w700,
      color: AppTheme.textSecondary,
      letterSpacing: 0.5,
    ),
  );
}

class _DocPicker extends StatelessWidget {
  final String label;
  final File? file;
  final VoidCallback onPick;
  const _DocPicker({required this.label, this.file, required this.onPick});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPick,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: file != null
              ? AppTheme.accent.withValues(alpha: 0.06)
              : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: file != null
                ? AppTheme.accent.withValues(alpha: 0.4)
                : AppTheme.divider,
          ),
        ),
        child: Row(
          children: [
            Icon(
              file != null ? Icons.check_circle : Icons.upload_file_outlined,
              color: file != null ? AppTheme.accent : AppTheme.textSecondary,
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                file != null ? file!.path.split('/').last : label,
                style: TextStyle(
                  fontSize: 13,
                  color: file != null
                      ? AppTheme.textPrimary
                      : AppTheme.textSecondary,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Text(
              file != null ? 'Change' : 'Upload',
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
