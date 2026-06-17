import 'package:flutter/foundation.dart';
import '../models/models.dart';
import '../services/api.dart';
import '../services/secure_store.dart';

enum AuthStatus { unknown, signedOut, signedIn }

class AuthController extends ChangeNotifier {
  final Api _api;
  final SecureStore _store;

  AuthController(this._api, this._store);

  AuthStatus status = AuthStatus.unknown;
  AccountState? account;
  String? error;

  Future<void> bootstrap() async {
    status = (await _store.hasSession) ? AuthStatus.signedIn : AuthStatus.signedOut;
    notifyListeners();
    if (status == AuthStatus.signedIn) {
      await loadAccount();
    }
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
    } catch (e) {
      error = e.toString();
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
    account = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  Future<void> logoutAllDevices() async {
    try {
      await _api.logoutAll();
    } catch (_) {}
    await _store.clear();
    account = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  Future<void> deleteAccount() async {
    await _api.deleteAccount();
    await _store.clear();
    account = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  void forceSignOut() {
    account = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }
}
