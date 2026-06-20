import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../models/models.dart';
import '../services/api.dart';
import '../services/secure_store.dart';
import '../services/settings_store.dart';

enum AuthStatus { unknown, signedOut, signedIn }

class AuthController extends ChangeNotifier {
  final Api _api;
  final SecureStore _store;
  final SettingsStore _settings;

  AuthController(this._api, this._store, this._settings);

  AuthStatus status = AuthStatus.unknown;
  AccountState? account;
  String? error;

  Future<void> bootstrap() async {
    final signed = await _store.hasSession;
    // Сразу поднимаем кэш аккаунта — чтобы гейтинг подключения работал офлайн.
    if (signed) _restoreCachedAccount();
    status = signed ? AuthStatus.signedIn : AuthStatus.signedOut;
    notifyListeners();
    if (signed) await loadAccount(); // фоновое обновление, если сеть доступна
  }

  void _restoreCachedAccount() {
    final raw = _settings.cachedAccount;
    if (raw == null) return;
    try {
      account = AccountState.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {}
  }

  /// Сохраняет токены и подтягивает аккаунт.
  Future<void> completeLogin(String access, String refresh) async {
    await _store.saveTokens(access, refresh);
    status = AuthStatus.signedIn;
    notifyListeners();
    await loadAccount();
  }

  /// Вход по одноразовому коду из личного кабинета. Бросает при неверном коде.
  Future<void> loginWithCode(String code) async {
    final r = await _api.loginWithCode(code);
    await completeLogin(r['accessToken'], r['refreshToken']);
  }

  Future<void> loadAccount() async {
    try {
      account = await _api.me();
      error = null;
      _settings.cachedAccount = jsonEncode(account!.toJson());
    } catch (e) {
      error = e.toString();
      // Сеть недоступна — оставляем кэш как есть (не сбрасываем подписку).
    }
    notifyListeners();
  }

  bool get hasActiveSubscription => account?.subscription?.isActive ?? false;

  Future<void> signOut() async {
    final refresh = await _store.refreshToken;
    if (refresh != null) {
      try {
        await _api.logout(refresh);
      } catch (_) {}
    }
    await _store.clear();
    await _settings.clearSession();
    account = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  Future<void> logoutAllDevices() async {
    try {
      await _api.logoutAll();
    } catch (_) {}
    await _store.clear();
    await _settings.clearSession();
    account = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  Future<void> deleteAccount() async {
    await _api.deleteAccount();
    await _store.clear();
    await _settings.clearSession();
    account = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  void forceSignOut() {
    account = null;
    status = AuthStatus.signedOut;
    _settings.clearSession();
    notifyListeners();
  }
}
