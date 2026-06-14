import 'package:shared_preferences/shared_preferences.dart';

/// Локальные настройки VPN (хранятся на устройстве).
class SettingsStore {
  static const _kKillSwitch = 'kill_switch';
  static const _kAutoStart = 'auto_start';
  static const _kBypassEnabled = 'bypass_enabled';
  static const _kSplitEnabled = 'split_enabled';
  static const _kSplitMode = 'split_mode'; // 'off' | 'include' | 'exclude'
  static const _kSplitApps = 'split_apps';
  static const _kDeviceId = 'device_id';

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
}
