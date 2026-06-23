import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../models/models.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/settings_store.dart';
import '../services/device_identity.dart';
import '../services/vpn_engine.dart';
import '../services/wg_keys.dart';

class VpnController extends ChangeNotifier {
  final Api _api;
  final VpnEngine _engine;
  final SettingsStore _settings;

  VpnController(this._api, this._engine, this._settings) {
    _statusSub = _engine.statusStream.listen(_onStatus);
  }

  late final StreamSubscription _statusSub;

  VpnStage stage = VpnStage.disconnected;
  String? error;
  BypassList? _bypassCache;

  /// Пинг по запросу (мс) и флаг измерения.
  int? lastPingMs;
  bool pinging = false;

  /// Вызывается один раз после успешного подключения — обновить/проверить аккаунт.
  Future<void> Function()? onConnected;

  bool get isConnected => stage == VpnStage.connected;
  bool get isBusy => stage == VpnStage.connecting || stage == VpnStage.disconnecting;

  /// Раздельное туннелирование и обход блокировок можно менять только при выключенном VPN.
  bool get canEditTunnelSettings => stage == VpnStage.disconnected;

  // ── настройки (проксируем в стор) ──
  bool get killSwitch => _settings.killSwitch;
  bool get autoStart => _settings.autoStart;
  bool get bypassEnabled => _settings.bypassEnabled;
  bool get splitEnabled => _settings.splitEnabled;
  String get splitMode => _settings.splitMode;
  List<String> get splitApps => _settings.splitApps;

  Future<void> setKillSwitch(bool v) async {
    _settings.killSwitch = v;
    notifyListeners();
  }

  Future<void> setAutoStart(bool v) async {
    _settings.autoStart = v;
    await _engine.setAutoStart(v);
    notifyListeners();
  }

  void setBypassEnabled(bool v) {
    if (!canEditTunnelSettings) return;
    _settings.bypassEnabled = v;
    notifyListeners();
  }

  /// Прямой режим (мимо CDN). Менять только при выключенном VPN.
  bool get directMode => _settings.directMode;
  bool get directOffered => _settings.directOffered;

  void setDirectMode(bool v) {
    if (!canEditTunnelSettings) return;
    _settings.directMode = v;
    notifyListeners();
  }

  bool _directProbed = false;

  /// Узнаёт у сервера, доступен ли прямой режим, ДО подключения — чтобы тумблер
  /// был виден сразу. Вызывать с главного экрана при наличии подписки.
  Future<void> refreshDirectAvailability() async {
    if (_directProbed || stage != VpnStage.disconnected) return;
    _directProbed = true;
    try {
      final deviceId = await _ensureDevice();
      final connection = await _api.connection(deviceId);
      _settings.directOffered = connection.hasDirect;
      _settings.cachedConnection = jsonEncode(connection.toMap());
      notifyListeners();
    } catch (_) {
      _directProbed = false; // повторим позже (не было сети/подписки)
    }
  }

  void setSplitEnabled(bool v) {
    if (!canEditTunnelSettings) return;
    _settings.splitEnabled = v;
    notifyListeners();
  }

  void setSplitMode(String mode) {
    if (!canEditTunnelSettings) return;
    _settings.splitMode = mode;
    notifyListeners();
  }

  void setSplitApps(List<String> apps) {
    if (!canEditTunnelSettings) return;
    _settings.splitApps = apps;
    notifyListeners();
  }

  Future<void> init() async {
    try {
      stage = await _engine.currentStage();
    } catch (_) {}
    notifyListeners();
  }

  Future<List<InstalledApp>> installedApps() => _engine.installedApps();

  /// Замеры метрик активны только на переднем плане (экономия батареи).
  void setStatsActive(bool active) {
    _engine.setStatsActive(active);
  }

  Future<void> connect() async {
    error = null;
    try {
      final config = await _resolveConfig();

      final ok = await _engine.prepare();
      if (!ok) {
        error = 'Не выдано разрешение на VPN';
        notifyListeners();
        return;
      }
      await _engine.connect(config);
    } catch (e) {
      error = e.toString();
      stage = VpnStage.error;
      notifyListeners();
    }
  }

  /// Конфиг туннеля: пробуем получить свежий с сервера (с таймаутом); если сеть
  /// недоступна (глушат связь) — берём последний кэш. Бизнес-ошибки сервера
  /// (нет подписки / лимит устройств) НЕ подменяем кэшем, а показываем.
  Future<TunnelConfig> _resolveConfig() async {
    try {
      final config =
          await _buildConfigOnline().timeout(const Duration(seconds: 12));
      _cacheConfig(config);
      return config;
    } on ApiException {
      rethrow;
    } catch (_) {
      final cached = _loadCachedConfig();
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<TunnelConfig> _buildConfigOnline() async {
    final deviceId = await _ensureDevice();
    final connection = await _api.connection(deviceId);
    // Запоминаем, доступен ли прямой режим (для тумблера), и кэшируем конфиг.
    _settings.directOffered = connection.hasDirect;
    _settings.cachedConnection = jsonEncode(connection.toMap());
    final bypass = await _loadBypass();
    final apps = bypass.apps.map((e) => e.value).toList();
    final domains = bypass.domains.map((e) => e.value).toList();

    // Прямой режим через AmneziaWG (нативный awg-туннель).
    if (_settings.directMode && connection.directAwg) {
      final awgCfg = await _buildAwgConfig(deviceId, connection, apps, domains);
      if (awgCfg != null) return awgCfg;
      // awg не получился (нет ключей/бинаря) — откат на CDN.
    }
    return _composeConfig(connection.select(_settings.directMode), apps, domains);
  }

  /// Собирает конфиг прямого режима AmneziaWG: генерит/берёт WG-пару, шлёт pubkey,
  /// получает awg-конфиг. null — если awg недоступен (нет бинаря/ключей).
  Future<TunnelConfig?> _buildAwgConfig(
    String deviceId,
    DeviceConnection conn,
    List<String> apps,
    List<String> domains,
  ) async {
    final pub = await _ensureWgKeys();
    if (pub == null) return null;
    final awg = await _api.awgConfig(deviceId, pub);
    if (awg == null) return null;
    return TunnelConfig(
      connection: conn.cdn, // обязательное поле; в awg-режиме не используется
      killSwitch: _settings.killSwitch,
      bypassEnabled: _settings.bypassEnabled,
      bypassApps: apps,
      bypassDomains: domains,
      splitEnabled: _settings.splitEnabled,
      splitMode: _settings.splitMode,
      splitApps: _settings.splitApps,
      awg: awg,
      wgPrivateKey: _settings.wgPrivateKey,
    );
  }

  /// Возвращает WG-pubkey устройства, генерируя пару при первом обращении
  /// (Curve25519, кросс-платформенно; приватный ключ не покидает устройство).
  Future<String?> _ensureWgKeys() async {
    if (_settings.wgPublicKey != null && _settings.wgPrivateKey != null) {
      return _settings.wgPublicKey;
    }
    try {
      final kp = await WgKeys.generate();
      _settings.wgPrivateKey = kp['private'];
      _settings.wgPublicKey = kp['public'];
      return kp['public'];
    } catch (_) {
      return null;
    }
  }

  TunnelConfig _composeConfig(
    VlessConnection connection,
    List<String> bypassApps,
    List<String> bypassDomains,
  ) =>
      TunnelConfig(
        connection: connection,
        killSwitch: _settings.killSwitch,
        bypassEnabled: _settings.bypassEnabled,
        bypassApps: bypassApps,
        bypassDomains: bypassDomains,
        splitEnabled: _settings.splitEnabled,
        splitMode: _settings.splitMode,
        splitApps: _settings.splitApps,
      );

  void _cacheConfig(TunnelConfig config) {
    // Конфиг подключения кэшируется целиком (оба варианта) в _buildConfigOnline;
    // здесь — только списки обхода.
    _settings.cachedBypassApps = config.bypassApps;
    _settings.cachedBypassDomains = config.bypassDomains;
  }

  TunnelConfig? _loadCachedConfig() {
    final raw = _settings.cachedConnection;
    if (raw == null) return null;
    try {
      final connection =
          DeviceConnection.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      return _composeConfig(
        connection.select(_settings.directMode),
        _settings.cachedBypassApps,
        _settings.cachedBypassDomains,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> disconnect() async {
    try {
      await _engine.disconnect();
    } catch (e) {
      error = e.toString();
      notifyListeners();
    }
  }

  /// Измеряет пинг по запросу (как в v2rayNG/Happ). Только при активном подключении.
  Future<void> pingNow() async {
    if (!isConnected || pinging) return;
    pinging = true;
    notifyListeners();
    try {
      lastPingMs = await _engine.pingNow();
    } catch (_) {
      lastPingMs = null;
    }
    pinging = false;
    notifyListeners();
  }

  /// Регистрирует устройство при каждом онлайн-подключении. Регистрация
  /// идемпотентна по hardwareId: сервер переиспользует устройство текущего
  /// аккаунта либо создаёт новое. Это чинит удаление устройства в админке/боте
  /// (раньше клиент «залипал» на старом id и не мог подключиться) и смену
  /// аккаунта (устройство регистрируется в новом аккаунте).
  Future<String> _ensureDevice() async {
    final ident = await DeviceIdentity.resolve();
    final device = await _api.registerDevice(
      name: ident.name,
      platform: ident.platform,
      hardwareId: ident.hardwareId,
    );
    _settings.deviceId = device.id;
    return device.id;
  }

  Future<BypassList> _loadBypass() async {
    _bypassCache = await _api.bypass();
    return _bypassCache!;
  }

  void _onStatus(VpnStatus s) {
    final wasConnected = stage == VpnStage.connected;
    stage = s.stage;
    if (s.stage == VpnStage.error) error = s.message;
    if (s.stage != VpnStage.connected) lastPingMs = null;
    notifyListeners();
    if (s.stage == VpnStage.connected && !wasConnected) {
      onConnected?.call();
    }
  }

  @override
  void dispose() {
    _statusSub.cancel();
    super.dispose();
  }
}
