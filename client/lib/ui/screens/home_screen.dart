import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/models.dart';
import '../../state/auth_controller.dart';
import '../../state/vpn_controller.dart';
import '../../state/update_controller.dart';
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
    final upd = context.watch<UpdateController>();
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
            if (upd.bannerVisible) ...[
              _UpdateBanner(info: upd.info!, onDismiss: upd.dismiss),
              const SizedBox(height: 16),
            ],
            _ConnectionCard(vpn: vpn, hasSub: hasSub, context: context),
            if (vpn.isConnected) ...[
              const SizedBox(height: 16),
              _PingCard(vpn: vpn),
            ],
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
        return hasSub ? 'Нажмите для подключения' : 'Подписка неактивна';
    }
  }
}

class _PingCard extends StatelessWidget {
  final VpnController vpn;
  const _PingCard({required this.vpn});

  @override
  Widget build(BuildContext context) {
    final ping = vpn.lastPingMs;
    final subtitle = vpn.pinging
        ? 'измеряем…'
        : (ping != null ? '$ping ms' : 'нажмите «Проверить»');
    return Card(
      child: ListTile(
        leading: const Icon(Icons.network_check, color: Color(0xFF8B98A5)),
        title: const Text('Пинг'),
        subtitle: Text(subtitle),
        trailing: vpn.pinging
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : TextButton(onPressed: vpn.pingNow, child: const Text('Проверить')),
      ),
    );
  }
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

class _UpdateBanner extends StatelessWidget {
  final AppVersionInfo info;
  final VoidCallback onDismiss;
  const _UpdateBanner({required this.info, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    final hasUrl = (info.updateUrl ?? '').isNotEmpty;
    final notes = info.notes ?? '';
    return Card(
      color: const Color(0xFF11233F),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        child: Row(
          children: [
            const Icon(Icons.system_update, color: Color(0xFF3B82F6)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Доступна новая версия${info.latestVersion != null ? ' ${info.latestVersion}' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  if (notes.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        notes,
                        style: const TextStyle(color: Color(0xFF8B98A5), fontSize: 12),
                      ),
                    ),
                ],
              ),
            ),
            if (hasUrl)
              TextButton(
                onPressed: () => launchUrl(
                  Uri.parse(info.updateUrl!),
                  mode: LaunchMode.externalApplication,
                ),
                child: const Text('Обновить'),
              ),
            IconButton(
              icon: const Icon(Icons.close, size: 18),
              onPressed: onDismiss,
            ),
          ],
        ),
      ),
    );
  }
}
