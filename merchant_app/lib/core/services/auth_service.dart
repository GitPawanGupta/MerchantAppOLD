import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/app_constants.dart';
import '../models/user_model.dart';
import '../models/merchant_model.dart';
import 'api_service.dart';

class AuthService {
  static Future<Map<String, dynamic>> login(
    String email,
    String password,
  ) async {
    final res = await ApiService.post('/auth/login', {
      'email': email,
      'password': password,
    }, auth: false);
    await _saveSession(res['data']);
    return res['data'] as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String phone,
    required String password,
    String? businessName,
    String? businessCategory,
  }) async {
    final res = await ApiService.post('/auth/register', {
      'name': name,
      'email': email,
      'phone': phone,
      'password': password,
      // ignore: use_null_aware_elements
      if (businessName != null) 'businessName': businessName,
      // ignore: use_null_aware_elements
      if (businessCategory != null) 'businessCategory': businessCategory,
    }, auth: false);
    await _saveSession(res['data']);
    return res['data'] as Map<String, dynamic>;
  }

  static Future<void> logout() async {
    try {
      await ApiService.post('/auth/logout', {});
    } catch (_) {}
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.keyAccessToken);
    await prefs.remove(AppConstants.keyRefreshToken);
    await prefs.remove(AppConstants.keyUser);
    await prefs.remove(AppConstants.keyMerchant);
  }

  static Future<void> changePassword(String current, String newPass) async {
    await ApiService.put('/auth/change-password', {
      'currentPassword': current,
      'newPassword': newPass,
    });
  }

  static Future<void> _saveSession(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      AppConstants.keyAccessToken,
      data['accessToken'] ?? '',
    );
    // Save refresh token if present (from cookies it comes via response body
    // only when explicitly returned; otherwise cookie handles it server-side)
    if (data['refreshToken'] != null) {
      await prefs.setString(AppConstants.keyRefreshToken, data['refreshToken']);
    }
    await prefs.setString(AppConstants.keyUser, jsonEncode(data['user'] ?? {}));
    // Only save merchant if it's not null — admin has no merchant profile
    if (data['merchant'] != null) {
      await prefs.setString(
        AppConstants.keyMerchant,
        jsonEncode(data['merchant']),
      );
    } else {
      await prefs.remove(AppConstants.keyMerchant);
    }
  }

  static Future<UserModel?> getCachedUser() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(AppConstants.keyUser);
    if (raw == null) return null;
    return UserModel.fromJson(jsonDecode(raw));
  }

  static Future<MerchantModel?> getCachedMerchant() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(AppConstants.keyMerchant);
    if (raw == null) return null;
    return MerchantModel.fromJson(jsonDecode(raw));
  }

  static Future<void> saveCachedMerchant(
    Map<String, dynamic> merchantJson,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.keyMerchant, jsonEncode(merchantJson));
  }

  static Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(AppConstants.keyAccessToken);
    return token != null && token.isNotEmpty;
  }
}
