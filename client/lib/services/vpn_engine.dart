import 'dart:io';
import 'package:flutter/services.dart';
import '../models/models.dart';
import 'windows_vpn_engine.dart';

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

/// Абстракция нативного VPN-движка. Android — VpnService+Xray через каналы;
/// Windows — управление процессами xray.exe + tun2socks.
abstract class VpnEngine {
  Stream<VpnStatus> get statusStream;
  Future<bool> prepare();
  Future<void> connect(TunnelConfig config);
  Future<void> disconnect();
  Future<VpnStage> currentStage();
  Future<int?> pingNow();
  Future<List<InstalledApp>> installedApps();
  Future<void> setAutoStart(bool enabled);
  Future<void> setStatsActive(bool active);
}

/// Выбор реализации по платформе.
VpnEngine createVpnEngine() =>
    Platform.isWindows ? WindowsVpnEngine() : AndroidVpnEngine();

/// Android: мост к VpnService + Xray через MethodChannel/EventChannel.
class AndroidVpnEngine implements VpnEngine {
  static const _method = MethodChannel('vpncdn/vpn');
  static const _status = EventChannel('vpncdn/vpn/status');

  Stream<VpnStatus>? _statusStream;

  @override
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

  @override
  Future<bool> prepare() async => (await _method.invokeMethod<bool>('prepare')) ?? false;

  @override
  Future<void> connect(TunnelConfig config) =>
      _method.invokeMethod('connect', config.toMap());

  @override
  Future<void> disconnect() => _method.invokeMethod('disconnect');

  @override
  Future<VpnStage> currentStage() async {
    final s = await _method.invokeMethod<String>('stage');
    return VpnStage.values.firstWhere((e) => e.name == s, orElse: () => VpnStage.disconnected);
  }

  @override
  Future<int?> pingNow() async {
    final ms = await _method.invokeMethod<int>('pingNow');
    return (ms != null && ms >= 0) ? ms : null;
  }

  @override
  Future<List<InstalledApp>> installedApps() async {
    final list = await _method.invokeMethod<List>('installedApps') ?? [];
    return list.map((e) => InstalledApp.fromMap(e as Map)).toList();
  }

  @override
  Future<void> setAutoStart(bool enabled) =>
      _method.invokeMethod('setAutoStart', {'enabled': enabled});

  @override
  Future<void> setStatsActive(bool active) =>
      _method.invokeMethod('setStatsActive', {'active': active});
}
