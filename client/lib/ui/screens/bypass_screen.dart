import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/api.dart';
import '../../state/vpn_controller.dart';
import '../widgets/locked_banner.dart';

class BypassScreen extends StatefulWidget {
  const BypassScreen({super.key});

  @override
  State<BypassScreen> createState() => _BypassScreenState();
}

class _BypassScreenState extends State<BypassScreen> {
  BypassList? _list;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      _list = await context.read<Api>().bypass();
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final vpn = context.watch<VpnController>();
    final locked = !vpn.canEditTunnelSettings;

    return Scaffold(
      appBar: AppBar(title: const Text('Обход блокировок VPN')),
      body: Column(
        children: [
          if (locked) const LockedBanner(),
          SwitchListTile(
            title: const Text('Включить обход'),
            subtitle: const Text(
                'РФ-приложения и сайты, не работающие через VPN, идут мимо туннеля'),
            value: vpn.bypassEnabled,
            onChanged: locked ? null : vpn.setBypassEnabled,
          ),
          const Divider(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    children: [
                      _section('Приложения', _list?.apps ?? []),
                      _section('Сайты', _list?.domains ?? []),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _section(String title, List<BypassItem> items) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
          child: Text(title,
              style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF8B98A5))),
        ),
        ...items.map((e) => ListTile(
              dense: true,
              title: Text(e.title),
              subtitle: Text(e.value, style: const TextStyle(fontSize: 11)),
              trailing: e.category != null ? Chip(label: Text(e.category!)) : null,
            )),
      ],
    );
  }
}
