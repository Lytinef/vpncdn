import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/vpn_controller.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final vpn = context.watch<VpnController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Настройки')),
      body: ListView(
        children: [
          SwitchListTile(
            title: const Text('Kill switch'),
            subtitle: const Text('Блокировать интернет, если VPN-соединение разорвалось'),
            value: vpn.killSwitch,
            onChanged: vpn.setKillSwitch,
          ),
          SwitchListTile(
            title: const Text('Запуск при старте системы'),
            subtitle: const Text('Автоматически подключать VPN после загрузки устройства'),
            value: vpn.autoStart,
            onChanged: vpn.setAutoStart,
          ),
        ],
      ),
    );
  }
}
