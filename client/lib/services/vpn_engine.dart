import 'package:flutter/services.dart';
import '../models/models.dart';

enum VpnStage { disconnected, connecting, connected, disconnecting, error }

class VpnStatus {
  final VpnStage stage;
  final String? message;
  VpnStatus(this.stage, [this.message]);
}

class VpnStats {
  final int pingMs;
  final double downloadMbps;
  final double uploadMbps;
  VpnStats({this.pingMs = 0, this.downloadMbps = 0, this.uploadMbps = 0});

  factory VpnStats.fromMap(Map<dynamic, dynamic> m) => VpnStats(
        pingMs: (m['pingMs'] ?? 0) as int,
        downloadMbps: ((m['downloadMbps'] ?? 0) as num).toDouble(),
        uploadMbps: ((m['uploadMbps'] ?? 0) as num).toDouble(),
      );
}

/// Конфигурация запуска туннеля, передаётся в нативное ядро.
class TunnelConfig {
  final VlessConnection connection;
  final bool killSwitch;
  final bool bypassEnabled;
  final List<String> bypassApps;
  final List<String> bypassDomains;
  final bool splitEnabled;
  final String splitMode; // include | exclude
  final List<String> splitApps;

  TunnelConfig({
    required this.connection,
    required this.killSwitch,
    required this.bypassEnabled,
    required this.bypassApps,
    required this.bypassDomains,
    required this.splitEnabled,
    required this.splitMode,
    required this.splitApps,
  });

  Map<String, dynamic> toMap() => {
        'connection': connection.toMap(),
        'killSwitch': killSwitch,
        'bypassEnabled': bypassEnabled,
        'bypassApps': bypassApps,
        'bypassDomains': bypassDomains,
        'splitEnabled': splitEnabled,
        'splitMode': splitMode,
        'splitApps': splitApps,
      };
}

/// Мост к нативному VPN-ядру (Android VpnService + Xray).
class VpnEngine {
  static const _method = MethodChannel('vpncdn/vpn');
  static const _status = EventChannel('vpncdn/vpn/status');
  static const _statsCh = EventChannel('vpncdn/vpn/stats');

  Stream<VpnStatus>? _statusStream;
  Stream<VpnStats>? _statsStream;

  Stream<VpnStatus> get statusStream {
    _statusStream ??= _status.receiveBroadcastStream().map((e) {
      final m = e as Map;
      return VpnStatus(
        VpnStage.values.firstWhere(
          (s) => s.name == m['stage'],
          orElse: () => VpnStage.disconnected,
        ),
        m['message'] as String?,
      );
    });
    return _statusStream!;
  }

  Stream<VpnStats> get statsStream {
    _statsStream ??= _statsCh.receiveBroadcastStream().map((e) => VpnStats.fromMap(e as Map));
    return _statsStream!;
  }

  /// Запрашивает у системы разрешение на VPN (Android prepare()).
  Future<bool> prepare() async => (await _method.invokeMethod<bool>('prepare')) ?? false;

  Future<void> connect(TunnelConfig config) =>
      _method.invokeMethod('connect', config.toMap());

  Future<void> disconnect() => _method.invokeMethod('disconnect');

  Future<VpnStage> currentStage() async {
    final s = await _method.invokeMethod<String>('stage');
    return VpnStage.values.firstWhere((e) => e.name == s, orElse: () => VpnStage.disconnected);
  }

  /// Мгновенный замер метрик (ping/скорость) даже без активного стрима.
  Future<VpnStats> measure() async {
    final m = await _method.invokeMethod<Map>('measure');
    return m != null ? VpnStats.fromMap(m) : VpnStats();
  }

  /// Список установленных приложений (для раздельного туннелирования).
  Future<List<InstalledApp>> installedApps() async {
    final list = await _method.invokeMethod<List>('installedApps') ?? [];
    return list.map((e) => InstalledApp.fromMap(e as Map)).toList();
  }

  /// Включить/выключить автозапуск при старте системы.
  Future<void> setAutoStart(bool enabled) =>
      _method.invokeMethod('setAutoStart', {'enabled': enabled});

  /// Активны ли замеры пинга/скорости (только на переднем плане — экономия батареи).
  Future<void> setStatsActive(bool active) =>
      _method.invokeMethod('setStatsActive', {'active': active});
}
