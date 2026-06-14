import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';

class DeviceIdentity {
  final String hardwareId;
  final String name;
  final String platform;

  DeviceIdentity({required this.hardwareId, required this.name, required this.platform});

  static Future<DeviceIdentity> resolve() async {
    final info = DeviceInfoPlugin();
    if (Platform.isAndroid) {
      final a = await info.androidInfo;
      return DeviceIdentity(
        hardwareId: a.id,
        name: '${a.manufacturer} ${a.model}',
        platform: 'android',
      );
    }
    if (Platform.isIOS) {
      final i = await info.iosInfo;
      return DeviceIdentity(
        hardwareId: i.identifierForVendor ?? i.name,
        name: i.name,
        platform: 'ios',
      );
    }
    if (Platform.isWindows) {
      final w = await info.windowsInfo;
      return DeviceIdentity(
        hardwareId: w.deviceId,
        name: w.computerName,
        platform: 'windows',
      );
    }
    return DeviceIdentity(hardwareId: 'unknown', name: 'Устройство', platform: 'android');
  }
}
