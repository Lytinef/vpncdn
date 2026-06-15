import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/models.dart';
import '../services/api.dart';
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
      final deviceId = await _ensureDevice();
      final connection = await _api.connection(deviceId);
      final bypass = await _loadBypass();

      final ok = await _engine.prepare();
      if (!ok) {
        error = 'Не выдано разрешение на VPN';
        notifyListeners();
        return;
      }

      final config = TunnelConfig(
        connection: connection,
        killSwitch: _settings.killSwitch,
        bypassEnabled: _settings.bypassEnabled,
        bypassApps: bypass.apps.map((e) => e.value).toList(),
        bypassDomains: bypass.domains.map((e) => e.value).toList(),
        splitEnabled: _settings.splitEnabled,
        splitMode: _settings.splitMode,
        splitApps: _settings.splitApps,
      );
      await _engine.connect(config);
    } catch (e) {
      error = e.toString();
      stage = VpnStage.error;
      notifyListeners();
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

  /// Регистрирует устройство при первом подключении и кеширует его id.
  Future<String> _ensureDevice() async {
    final existing = _settings.deviceId;
    if (existing != null) return existing;
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
    stage = s.stage;
    if (s.stage == VpnStage.error) error = s.message;
    notifyListeners();
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
