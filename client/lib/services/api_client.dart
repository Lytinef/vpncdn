import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';
import 'secure_store.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => message;
}

/// HTTP-клиент с авто-обновлением access-токена по refresh.
class ApiClient {
  final SecureStore _store;
  final http.Client _http;
  bool _refreshing = false;

  ApiClient(this._store, [http.Client? client]) : _http = client ?? http.Client();

  /// Колбэк при окончательной потере авторизации (разлогинить UI).
  void Function()? onUnauthorized;

  Future<dynamic> get(String path, {bool auth = true}) =>
      _send('GET', path, auth: auth);

  Future<dynamic> post(String path, {Object? body, bool auth = true}) =>
      _send('POST', path, body: body, auth: auth);

  Future<dynamic> patch(String path, {Object? body, bool auth = true}) =>
      _send('PATCH', path, body: body, auth: auth);

  Future<dynamic> delete(String path, {bool auth = true}) =>
      _send('DELETE', path, auth: auth);

  Future<dynamic> _send(
    String method,
    String path, {
    Object? body,
    bool auth = true,
    bool isRetry = false,
  }) async {
    final uri = Uri.parse('${AppConfig.apiUrl}$path');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (auth) {
      final token = await _store.accessToken;
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }

    final res = await _http.send(_request(method, uri, headers, body));
    final resp = await http.Response.fromStream(res);

    if (resp.statusCode == 401 && auth && !isRetry) {
      final r = await _tryRefresh();
      if (r == true) return _send(method, path, body: body, auth: auth, isRetry: true);
      if (r == false) {
        // Сервер ОТКЛОНИЛ refresh — сессия действительно мертва, разлогиниваем.
        onUnauthorized?.call();
        throw ApiException(401, 'Сессия истекла');
      }
      // r == null: сеть недоступна/временная ошибка — НЕ разлогиниваем (частая
      // причина «вылета из аккаунта» при плохом интернете с включённым VPN).
      throw ApiException(503, 'Нет соединения с сервером');
    }

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      if (resp.body.isEmpty) return null;
      return jsonDecode(resp.body);
    }

    String message = 'Ошибка ${resp.statusCode}';
    try {
      final b = jsonDecode(resp.body);
      final m = b['message'];
      message = m is List ? m.join(', ') : (m?.toString() ?? message);
    } catch (_) {}
    throw ApiException(resp.statusCode, message);
  }

  http.BaseRequest _request(
    String method,
    Uri uri,
    Map<String, String> headers,
    Object? body,
  ) {
    final req = http.Request(method, uri);
    req.headers.addAll(headers);
    if (body != null) req.body = jsonEncode(body);
    return req;
  }

  /// true — токены обновлены; false — сервер отклонил (сессия мертва, надо
  /// разлогинить); null — сетевая/временная ошибка (сессию НЕ трогаем).
  Future<bool?> _tryRefresh() async {
    if (_refreshing) return null; // параллельное обновление — не разлогиниваем
    _refreshing = true;
    try {
      final refresh = await _store.refreshToken;
      if (refresh == null) return false;
      final res = await _http
          .post(
            Uri.parse('${AppConfig.apiUrl}/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refreshToken': refresh}),
          )
          .timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final b = jsonDecode(res.body);
        await _store.saveTokens(b['accessToken'], b['refreshToken']);
        return true;
      }
      // 401/403 — refresh недействителен (сессия мертва); прочее (5xx) — временно.
      if (res.statusCode == 401 || res.statusCode == 403) return false;
      return null;
    } catch (_) {
      return null; // сеть недоступна — не разлогиниваем
    } finally {
      _refreshing = false;
    }
  }
}
