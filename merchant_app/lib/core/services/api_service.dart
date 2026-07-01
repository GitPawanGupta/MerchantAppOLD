import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../constants/app_constants.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, {this.statusCode});
  @override
  String toString() => message;
}

class ApiService {
  static String _activeBaseUrl = AppConstants.baseUrl;
  // Fallback: Direct Railway URL if custom domain has issues
  static const String _fallbackBaseUrl =
      'https://merchantappold-production.up.railway.app/api';

  // ── Token management ───────────────────────────────────────────────────────
  static Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(AppConstants.keyAccessToken);
  }

  static Future<String?> _getRefreshToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(AppConstants.keyRefreshToken);
  }

  static Future<void> _saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.keyAccessToken, token);
  }

  /// Try to refresh the access token using the refresh token.
  /// Returns new access token or throws if refresh fails (session expired).
  static Future<String> _refreshAccessToken() async {
    final refreshToken = await _getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      throw ApiException(
        'Session expired. Please login again.',
        statusCode: 401,
      );
    }

    Future<http.Response> makeRequest(String baseUrl) {
      final uri = Uri.parse('$baseUrl/auth/refresh');
      return http
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refreshToken': refreshToken}),
          )
          .timeout(AppConstants.receiveTimeout);
    }

    http.Response response;
    try {
      response = await _safeCall(() => makeRequest(_activeBaseUrl));
    } catch (e) {
      final isDnsOrNetworkFailure =
          e is ApiException &&
          (e.message.contains('DNS') ||
              e.message.contains('Network unreachable') ||
              e.message.contains('host lookup'));
      if (isDnsOrNetworkFailure && _activeBaseUrl == AppConstants.baseUrl) {
        _activeBaseUrl = _fallbackBaseUrl;
        response = await _safeCall(() => makeRequest(_activeBaseUrl));
      } else {
        rethrow;
      }
    }

    if (response.statusCode == 200) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final newToken = body['data']?['accessToken'] as String?;
      if (newToken != null) {
        await _saveToken(newToken);
        return newToken;
      }
    }

    // Refresh failed — clear tokens and signal re-login needed
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.keyAccessToken);
    await prefs.remove(AppConstants.keyRefreshToken);
    throw ApiException('Session expired. Please login again.', statusCode: 401);
  }

  // ── Headers ────────────────────────────────────────────────────────────────
  static Map<String, String> _headers({
    String? token,
    bool isMultipart = false,
  }) {
    return {
      if (!isMultipart) 'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // ── Response parser ───────────────────────────────────────────────────────
  static Map<String, dynamic> _parseBody(http.Response response) {
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 200 && response.statusCode < 300) return body;
    final msg = body['message'] ?? 'Request failed (${response.statusCode})';
    throw ApiException(msg, statusCode: response.statusCode);
  }

  /// Wraps a network call and converts low-level exceptions into [ApiException].
  static Future<http.Response> _safeCall(
    Future<http.Response> Function() fn,
  ) async {
    try {
      return await fn();
    } on SocketException catch (e) {
      final msg = e.message.toLowerCase();
      final isDnsFailure =
          msg.contains('failed host lookup') ||
          msg.contains('nodename nor servname') ||
          msg.contains('no address associated');
      if (isDnsFailure) {
        throw ApiException(
          'Unable to connect to server. Please check your internet connection and try again.\n\n'
          '• Make sure you have an active internet connection\n'
          '• Try switching between Wi-Fi and Mobile Data',
        );
      }
      throw ApiException(
        'Network unreachable. Please check your internet connection.\n(${e.message})',
      );
    } on TimeoutException {
      throw ApiException(
        'Server is taking too long to respond. It may be starting up — please try again in a moment.',
      );
    } on HandshakeException catch (e) {
      throw ApiException(
        'Secure connection failed. Try again or check your network.\n(${e.message})',
      );
    } on HttpException catch (e) {
      throw ApiException('HTTP error: ${e.message}');
    } on FormatException {
      throw ApiException('Unexpected response from server. Please try again.');
    }
  }

  /// Execute a request with automatic token refresh on 401.
  static Future<Map<String, dynamic>> _executeWithRefresh(
    Future<http.Response> Function(String baseUrl, String? token) requestFn, {
    bool auth = true,
  }) async {
    String? token = auth ? await _getToken() : null;
    http.Response response;
    try {
      response = await _safeCall(() => requestFn(_activeBaseUrl, token));
    } catch (e) {
      final isDnsOrNetworkFailure =
          e is ApiException &&
          (e.message.contains('DNS') ||
              e.message.contains('Network unreachable') ||
              e.message.contains('host lookup'));
      if (isDnsOrNetworkFailure && _activeBaseUrl == AppConstants.baseUrl) {
        _activeBaseUrl = _fallbackBaseUrl;
        response = await _safeCall(() => requestFn(_activeBaseUrl, token));
      } else {
        rethrow;
      }
    }

    // Auto-refresh on 401 Unauthorized
    if (response.statusCode == 401 && auth) {
      try {
        token = await _refreshAccessToken();
        response = await _safeCall(() => requestFn(_activeBaseUrl, token));
      } on ApiException {
        rethrow;
      }
    }
    return _parseBody(response);
  }

  // ── GET ────────────────────────────────────────────────────────────────────
  static Future<Map<String, dynamic>> get(
    String path, {
    bool auth = true,
  }) async {
    return _executeWithRefresh(
      (baseUrl, token) => http
          .get(Uri.parse('$baseUrl$path'), headers: _headers(token: token))
          .timeout(AppConstants.receiveTimeout),
      auth: auth,
    );
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  static Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    bool auth = true,
  }) async {
    return _executeWithRefresh(
      (baseUrl, token) => http
          .post(
            Uri.parse('$baseUrl$path'),
            headers: _headers(token: token),
            body: jsonEncode(body),
          )
          .timeout(AppConstants.receiveTimeout),
      auth: auth,
    );
  }

  // ── PUT ────────────────────────────────────────────────────────────────────
  static Future<Map<String, dynamic>> put(
    String path,
    Map<String, dynamic> body,
  ) async {
    return _executeWithRefresh(
      (baseUrl, token) => http
          .put(
            Uri.parse('$baseUrl$path'),
            headers: _headers(token: token),
            body: jsonEncode(body),
          )
          .timeout(AppConstants.receiveTimeout),
    );
  }

  // ── PATCH ──────────────────────────────────────────────────────────────────
  static Future<Map<String, dynamic>> patch(
    String path,
    Map<String, dynamic> body,
  ) async {
    return _executeWithRefresh(
      (baseUrl, token) => http
          .patch(
            Uri.parse('$baseUrl$path'),
            headers: _headers(token: token),
            body: jsonEncode(body),
          )
          .timeout(AppConstants.receiveTimeout),
    );
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  static Future<Map<String, dynamic>> delete(String path) async {
    return _executeWithRefresh(
      (baseUrl, token) => http
          .delete(Uri.parse('$baseUrl$path'), headers: _headers(token: token))
          .timeout(AppConstants.receiveTimeout),
    );
  }

  // ── Multipart (KYC file upload) ────────────────────────────────────────────
  static Future<Map<String, dynamic>> postMultipart(
    String path,
    Map<String, String> fields,
    Map<String, File> files,
  ) async {
    final token = await _getToken();

    Future<http.Response> makeRequest(String baseUrl) async {
      final uri = Uri.parse('$baseUrl$path');
      final request = http.MultipartRequest('POST', uri)
        ..headers.addAll(_headers(token: token, isMultipart: true))
        ..fields.addAll(fields);

      for (final entry in files.entries) {
        request.files.add(
          await http.MultipartFile.fromPath(entry.key, entry.value.path),
        );
      }

      final streamed = await request.send().timeout(
        AppConstants.receiveTimeout,
      );
      return http.Response.fromStream(streamed);
    }

    try {
      final response = await _safeCall(() => makeRequest(_activeBaseUrl));
      return _parseBody(response);
    } catch (e) {
      final isDnsOrNetworkFailure =
          e is ApiException &&
          (e.message.contains('DNS') ||
              e.message.contains('Network unreachable') ||
              e.message.contains('host lookup'));
      if (isDnsOrNetworkFailure && _activeBaseUrl == AppConstants.baseUrl) {
        _activeBaseUrl = _fallbackBaseUrl;
        final response = await _safeCall(() => makeRequest(_activeBaseUrl));
        return _parseBody(response);
      }
      rethrow;
    }
  }
}
