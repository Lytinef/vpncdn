import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/vpn_controller.dart';
import '../widgets/locked_banner.dart';

class SplitTunnelingScreen extends StatefulWidget {
  const SplitTunnelingScreen({super.key});

  @override
  State<SplitTunnelingScreen> createState() => _SplitTunnelingScreenState();
}

class _SplitTunnelingScreenState extends State<SplitTunnelingScreen> {
  List<InstalledApp> _apps = [];
  bool _loading = true;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final vpn = context.read<VpnController>();
    try {
      _apps = await vpn.installedApps();
      _apps.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final vpn = context.watch<VpnController>();
    final locked = !vpn.canEditTunnelSettings;
    final selected = vpn.splitApps.toSet();
    final filtered = _apps
        .where((a) => _query.isEmpty || a.name.toLowerCase().contains(_query.toLowerCase()))
        .toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Раздельное туннелирование')),
      body: Column(
        children: [
          if (locked) const LockedBanner(),
          SwitchListTile(
            title: const Text('Включить раздельное туннелирование'),
            value: vpn.splitEnabled,
            onChanged: locked ? null : vpn.setSplitEnabled,
          ),
          if (vpn.splitEnabled) ...[
            RadioListTile<String>(
              title: const Text('Туннелировать всё, кроме выбранных'),
              value: 'exclude',
              groupValue: vpn.splitMode,
              onChanged: locked ? null : (v) => vpn.setSplitMode(v!),
            ),
            RadioListTile<String>(
              title: const Text('Туннелировать только выбранные'),
              value: 'include',
              groupValue: vpn.splitMode,
              onChanged: locked ? null : (v) => vpn.setSplitMode(v!),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: TextField(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: 'Поиск приложений',
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => setState(() => _query = v),
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView.builder(
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final app = filtered[i];
                        final on = selected.contains(app.packageName);
                        return CheckboxListTile(
                          title: Text(app.name),
                          subtitle: Text(app.packageName,
                              style: const TextStyle(fontSize: 11, color: Color(0xFF8B98A5))),
                          value: on,
                          onChanged: locked
                              ? null
                              : (v) {
                                  final next = {...selected};
                                  v == true ? next.add(app.packageName) : next.remove(app.packageName);
                                  vpn.setSplitApps(next.toList());
                                },
                        );
                      },
                    ),
            ),
          ] else
            const Expanded(child: SizedBox()),
        ],
      ),
    );
  }
}
