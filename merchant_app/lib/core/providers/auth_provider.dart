import 'package:flutter/foundation.dart';
import '../models/user_model.dart';
import '../models/merchant_model.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  UserModel? _user;
  MerchantModel? _merchant;
  bool _isLoading = false;
  String? _error;

  UserModel? get user => _user;
  MerchantModel? get merchant => _merchant;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isLoggedIn => _user != null;

  Future<void> init() async {
    _user = await AuthService.getCachedUser();
    // Only load merchant if user is not admin
    final cachedUser = _user;
    if (cachedUser != null && cachedUser.role != 'admin') {
      _merchant = await AuthService.getCachedMerchant();
    }
    notifyListeners();
  }

  /// Returns the user's role on success, null on failure
  Future<String?> login(String email, String password) async {
    _setLoading(true);
    try {
      final data = await AuthService.login(email, password);
      _user = UserModel.fromJson(data['user']);
      if (data['merchant'] != null) {
        _merchant = MerchantModel.fromJson(data['merchant']);
      } else {
        _merchant = null;
      }
      _error = null;
      return _user!.role; // returns 'admin' or 'merchant'
    } on ApiException catch (e) {
      _error = e.message;
      return null;
    } catch (e) {
      debugPrint('[AuthProvider.login] Unexpected error: $e');
      _error = 'Something went wrong. Please try again.';
      return null;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> register({
    required String name,
    required String email,
    required String phone,
    required String password,
    String? businessName,
  }) async {
    _setLoading(true);
    try {
      final data = await AuthService.register(
        name: name,
        email: email,
        phone: phone,
        password: password,
        businessName: businessName,
      );
      _user = UserModel.fromJson(data['user']);
      _merchant = MerchantModel.fromJson(data['merchant']);
      _error = null;
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      return false;
    } catch (e) {
      debugPrint('[AuthProvider.register] Unexpected error: $e');
      _error = 'Something went wrong. Please try again.';
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<void> logout() async {
    await AuthService.logout();
    _user = null;
    _merchant = null;
    notifyListeners();
  }

  Future<void> refreshProfile() async {
    try {
      final res = await ApiService.get('/auth/me');
      final data = res['data'] as Map<String, dynamic>;
      _user = UserModel.fromJson(data['user']);
      if (data['merchant'] != null) {
        _merchant = MerchantModel.fromJson(data['merchant']);
        // Persist updated merchant so cache stays fresh on app restart
        await AuthService.saveCachedMerchant(
          data['merchant'] as Map<String, dynamic>,
        );
      }
      notifyListeners();
    } catch (_) {}
  }

  void updateMerchant(MerchantModel m) {
    _merchant = m;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  void _setLoading(bool v) {
    _isLoading = v;
    notifyListeners();
  }
}
