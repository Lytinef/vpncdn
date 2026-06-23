import 'package:shared_preferences/shared_preferences.dart';

/// Локальные настройки VPN (хранятся на устройстве).
class SettingsStore {
  static const _kKillSwitch = 'kill_switch';
  static const _kAutoStart = 'auto_start';
  static const _kBypassEnabled = 'bypass_enabled';
  static const _kDirectMode = 'direct_mode';
  static const _kDirectOffered = 'direct_offered';
  static const _kWgPrivateKey = 'wg_private_key';
  static const _kWgPublicKey = 'wg_public_key';
  static const _kSplitEnabled = 'split_enabled';
  static const _kSplitMode = 'split_mode'; // 'off' | 'include' | 'exclude'
  static const _kSplitApps = 'split_apps';
  static const _kDeviceId = 'device_id';
  static const _kCachedAccount = 'cached_account';
  static const _kCachedConnection = 'cached_connection';
  static const _kBypassApps = 'cached_bypass_apps';
  static const _kBypassDomains = 'cached_bypass_domains';

  late SharedPreferences _p;

  Future<void> init() async {
    _p = await SharedPreferences.getInstance();
  }

  bool get killSwitch => _p.getBool(_kKillSwitch) ?? false;
  set killSwitch(bool v) => _p.setBool(_kKillSwitch, v);

  bool get autoStart => _p.getBool(_kAutoStart) ?? false;
  set autoStart(bool v) => _p.setBool(_kAutoStart, v);

  /// Обход блокировок VPN: РФ-сервисы идут мимо туннеля.
  bool get bypassEnabled => _p.getBool(_kBypassEnabled) ?? true;
  set bypassEnabled(bool v) => _p.setBool(_kBypassEnabled, v);

  /// Прямой режим (мимо CDN): ниже пинг, но IP может блокироваться.
  /// По умолчанию выкл — стабильный CDN.
  bool get directMode => _p.getBool(_kDirectMode) ?? false;
  set directMode(bool v) => _p.setBool(_kDirectMode, v);

  /// Предлагает ли сервер прямой режим (узнаём после запроса конфига) —
  /// от этого зависит показ тумблера.
  bool get directOffered => _p.getBool(_kDirectOffered) ?? false;
  set directOffered(bool v) => _p.setBool(_kDirectOffered, v);

  /// WG-пара устройства для прямого режима AmneziaWG (приватный не покидает устройство).
  String? get wgPrivateKey => _p.getString(_kWgPrivateKey);
  set wgPrivateKey(String? v) =>
      v == null ? _p.remove(_kWgPrivateKey) : _p.setString(_kWgPrivateKey, v);
  String? get wgPublicKey => _p.getString(_kWgPublicKey);
  set wgPublicKey(String? v) =>
      v == null ? _p.remove(_kWgPublicKey) : _p.setString(_kWgPublicKey, v);

  /// Раздельное туннелирование включено.
  bool get splitEnabled => _p.getBool(_kSplitEnabled) ?? false;
  set splitEnabled(bool v) => _p.setBool(_kSplitEnabled, v);

  /// 'include' — туннелировать только выбранные; 'exclude' — все, кроме выбранных.
  String get splitMode => _p.getString(_kSplitMode) ?? 'exclude';
  set splitMode(String v) => _p.setString(_kSplitMode, v);

  List<String> get splitApps => _p.getStringList(_kSplitApps) ?? [];
  set splitApps(List<String> v) => _p.setStringList(_kSplitApps, v);

  String? get deviceId => _p.getString(_kDeviceId);
  set deviceId(String? v) => v == null ? _p.remove(_kDeviceId) : _p.setString(_kDeviceId, v);

  // ── Кэш аккаунта/подписки и конфига подключения ──
  // Позволяет подключаться к VPN по последним известным данным, когда сеть
  // глушат и сервер недоступен; обновляется после успешного запроса.

  String? get cachedAccount => _p.getString(_kCachedAccount);
  set cachedAccount(String? v) =>
      v == null ? _p.remove(_kCachedAccount) : _p.setString(_kCachedAccount, v);

  String? get cachedConnection => _p.getString(_kCachedConnection);
  set cachedConnection(String? v) =>
      v == null ? _p.remove(_kCachedConnection) : _p.setString(_kCachedConnection, v);

  List<String> get cachedBypassApps => _p.getStringList(_kBypassApps) ?? [];
  set cachedBypassApps(List<String> v) => _p.setStringList(_kBypassApps, v);

  List<String> get cachedBypassDomains => _p.getStringList(_kBypassDomains) ?? [];
  set cachedBypassDomains(List<String> v) => _p.setStringList(_kBypassDomains, v);

  /// Чистит данные сессии при выходе/смене аккаунта: устройство, кэш аккаунта
  /// и конфига. Настройки (kill switch, split и т.п.) и кэш bypass — сохраняем.
  Future<void> clearSession() async {
    await _p.remove(_kDeviceId);
    await _p.remove(_kCachedAccount);
    await _p.remove(_kCachedConnection);
  }
}
