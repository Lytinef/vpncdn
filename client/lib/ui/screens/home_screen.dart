import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/auth_controller.dart';
import '../../state/vpn_controller.dart';
import '../../services/vpn_engine.dart';
import 'subscription_screen.dart';
import 'split_tunneling_screen.dart';
import 'bypass_screen.dart';
import 'settings_screen.dart';
import 'account_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final vpn = context.watch<VpnController>();
    final sub = auth.account?.subscription;
    final hasSub = auth.hasActiveSubscription;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Unway'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline),
            onPressed: () => _go(context, const AccountScreen()),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: auth.loadAccount,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _ConnectionCard(vpn: vpn, hasSub: hasSub, context: context),
            const SizedBox(height: 16),
            _MetricsRow(stats: vpn.stats, connected: vpn.isConnected),
            const SizedBox(height: 20),
            _SubscriptionBanner(
              statusText: hasSub
                  ? '${sub!.plan.name} · до ${_fmtDate(sub.currentPeriodEnd)}'
                  : 'Подписка не активна',
              active: hasSub,
              onTap: () => _go(context, const SubscriptionScreen()),
            ),
            const SizedBox(height: 12),
            _MenuTile(
              icon: Icons.alt_route,
              title: 'Раздельное туннелирование',
              subtitle: vpn.splitEnabled ? 'включено' : 'выключено',
              onTap: () => _go(context, const SplitTunnelingScreen()),
            ),
            _MenuTile(
              icon: Icons.shield_outlined,
              title: 'Обход блокировок VPN',
              subtitle: vpn.bypassEnabled ? 'включён' : 'выключен',
              onTap: () => _go(context, const BypassScreen()),
            ),
            _MenuTile(
              icon: Icons.settings_outlined,
              title: 'Настройки',
              subtitle: 'Kill switch, автозапуск',
              onTap: () => _go(context, const SettingsScreen()),
            ),
          ],
        ),
      ),
    );
  }

  static void _go(BuildContext c, Widget s) =>
      Navigator.of(c).push(MaterialPageRoute(builder: (_) => s));

  static String _fmtDate(DateTime? d) =>
      d == null ? '—' : '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
}

class _ConnectionCard extends StatelessWidget {
  final VpnController vpn;
  final bool hasSub;
  final BuildContext context;
  const _ConnectionCard({required this.vpn, required this.hasSub, required this.context});

  @override
  Widget build(BuildContext _) {
    final connected = vpn.isConnected;
    final busy = vpn.isBusy;
    final color = connected ? const Color(0xFF1F9D55) : const Color(0xFF3B82F6);

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(
          children: [
            GestureDetector(
              onTap: busy ? null : () => _toggle(context, vpn, hasSub),
              child: Container(
                width: 160,
                height: 160,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: color.withOpacity(0.12),
                  border: Border.all(color: color, width: 3),
                ),
                child: busy
                    ? const Center(child: CircularProgressIndicator())
                    : Icon(connected ? Icons.power_settings_new : Icons.power_settings_new,
                        size: 64, color: color),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              _stageLabel(vpn.stage),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            if (vpn.error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8, left: 24, right: 24),
                child: Text(vpn.error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFFE5484D), fontSize: 13)),
              ),
          ],
        ),
      ),
    );
  }

  void _toggle(BuildContext context, VpnController vpn, bool hasSub) {
    if (vpn.isConnected) {
      vpn.disconnect();
      return;
    }
    if (!hasSub) {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
      );
      return;
    }
    vpn.connect();
  }

  String _stageLabel(VpnStage s) {
    switch (s) {
      case VpnStage.connected:
        return 'Подключено';
      case VpnStage.connecting:
        return 'Подключение…';
      case VpnStage.disconnecting:
        return 'Отключение…';
      case VpnStage.error:
        return 'Ошибка';
      case VpnStage.disconnected:
        return hasSub ? 'Нажмите для подключения' : 'Оформите подписку';
    }
  }
}

class _MetricsRow extends StatelessWidget {
  final VpnStats stats;
  final bool connected;
  const _MetricsRow({required this.stats, required this.connected});

  @override
  Widget build(BuildContext context) {
    String v(num x, String unit) => connected ? '${x.toStringAsFixed(unit == 'ms' ? 0 : 1)} $unit' : '—';
    return Row(
      children: [
        _metric('Пинг', v(stats.pingMs, 'ms'), Icons.network_check),
        _metric('Загрузка', v(stats.downloadMbps, 'Mbps'), Icons.download),
        _metric('Отдача', v(stats.uploadMbps, 'Mbps'), Icons.upload),
      ],
    );
  }

  Widget _metric(String label, String value, IconData icon) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              children: [
                Icon(icon, size: 20, color: const Color(0xFF8B98A5)),
                const SizedBox(height: 8),
                Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(label, style: const TextStyle(color: Color(0xFF8B98A5), fontSize: 12)),
              ],
            ),
          ),
        ),
      );
}

class _SubscriptionBanner extends StatelessWidget {
  final String statusText;
  final bool active;
  final VoidCallback onTap;
  const _SubscriptionBanner({required this.statusText, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(active ? Icons.verified : Icons.error_outline,
            color: active ? const Color(0xFF1F9D55) : const Color(0xFFE5484D)),
        title: const Text('Подписка'),
        subtitle: Text(statusText),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _MenuTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
