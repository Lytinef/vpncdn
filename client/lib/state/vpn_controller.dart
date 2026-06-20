import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../models/models.dart';
import '../services/api.dart';
import '../services/api_client.dart';
import '../services/settings_store.dart';
import '../services/device_identity.dart';
import '../services/vpn_engine.dart';

class VpnController extends ChangeNotifier {
  final Api _api;
  final VpnEngine _engine;
  final SettingsStore _settings;

  VpnController(this._api, this._engine, this._settings) {
    _statusSub = _engine.statusStream.listen(_onStatus);
    _statsSub = _engine.statsStream.listen(_onStats);
  }

  late final StreamSubscription _statusSub;
  late final StreamSubscription _statsSub;

  VpnStage stage = VpnStage.disconnected;
  VpnStats stats = VpnStats();
  String? error;
  BypassList? _bypassCache;

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
    final bypass = await _loadBypass();
    return _composeConfig(
      connection,
      bypass.apps.map((e) => e.value).toList(),
      bypass.domains.map((e) => e.value).toList(),
    );
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
    _settings.cachedConnection = jsonEncode(config.connection.toMap());
    _settings.cachedBypassApps = config.bypassApps;
    _settings.cachedBypassDomains = config.bypassDomains;
  }

  TunnelConfig? _loadCachedConfig() {
    final raw = _settings.cachedConnection;
    if (raw == null) return null;
    try {
      final connection =
          VlessConnection.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      return _composeConfig(
        connection,
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
    notifyListeners();
    if (s.stage == VpnStage.connected && !wasConnected) {
      onConnected?.call();
    }
  }

  void _onStats(VpnStats s) {
    stats = s;
    notifyListeners();
  }

  @override
  void dispose() {
    _statusSub.cancel();
    _statsSub.cancel();
    super.dispose();
  }
}
