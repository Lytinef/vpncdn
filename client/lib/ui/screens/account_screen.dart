import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/auth_controller.dart';
import '../../state/vpn_controller.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final user = auth.account?.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Аккаунт')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundImage: user?.photoUrl != null ? NetworkImage(user!.photoUrl!) : null,
                child: user?.photoUrl == null ? const Icon(Icons.person) : null,
              ),
              title: Text(user?.firstName ?? user?.username ?? 'Пользователь'),
              subtitle: user?.username != null ? Text('@${user!.username}') : null,
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.logout),
                  title: const Text('Выйти на этом устройстве'),
                  onTap: () => _signOut(context),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.devices_other),
                  title: const Text('Выйти со всех устройств'),
                  onTap: () => _logoutAll(context),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.delete_forever, color: Color(0xFFE5484D)),
              title: const Text('Удалить аккаунт',
                  style: TextStyle(color: Color(0xFFE5484D))),
              subtitle: const Text('Безвозвратно. Деньги не возвращаются.'),
              onTap: () => _deleteAccount(context),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _signOut(BuildContext context) async {
    await context.read<VpnController>().disconnect();
    await context.read<AuthController>().signOut();
  }

  void _logoutAll(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Выйти со всех устройств?'),
        content: const Text('Все сессии будут завершены, потребуется повторный вход.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              await context.read<VpnController>().disconnect();
              await context.read<AuthController>().logoutAllDevices();
            },
            child: const Text('Выйти везде'),
          ),
        ],
      ),
    );
  }

  void _deleteAccount(BuildContext context) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Удалить аккаунт?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Это действие необратимо. Будут удалены подписка, устройства и история.\n\n'
              'Оплаченные средства НЕ возвращаются.\n\n'
              'Введите УДАЛИТЬ для подтверждения:',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              decoration: const InputDecoration(border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
          TextButton(
            onPressed: () async {
              if (controller.text.trim().toUpperCase() != 'УДАЛИТЬ') return;
              Navigator.pop(context);
              final auth = context.read<AuthController>();
              final vpn = context.read<VpnController>();
              try {
                await vpn.disconnect();
                await auth.deleteAccount();
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text('Ошибка: $e')));
                }
              }
            },
            child: const Text('Удалить', style: TextStyle(color: Color(0xFFE5484D))),
          ),
        ],
      ),
    );
  }
}
