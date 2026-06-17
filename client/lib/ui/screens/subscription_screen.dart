import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/auth_controller.dart';

/// Экран подписки — только данные о текущей подписке (без оплаты и смены тарифа;
/// управление вынесено в личный кабинет).
class SubscriptionScreen extends StatelessWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final account = auth.account;
    final sub = account?.subscription;
    final hasSub = auth.hasActiveSubscription;

    return Scaffold(
      appBar: AppBar(title: const Text('Подписка')),
      body: RefreshIndicator(
        onRefresh: auth.loadAccount,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (hasSub && sub != null)
              _SubCard(sub: sub, account: account!)
            else
              const _InactiveCard(),
          ],
        ),
      ),
    );
  }
}

class _SubCard extends StatelessWidget {
  final Subscription sub;
  final AccountState account;
  const _SubCard({required this.sub, required this.account});

  bool get _isTrial => sub.plan.code == 'trial';

  @override
  Widget build(BuildContext context) {
    final canceled = sub.cancelAtPeriodEnd;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _isTrial ? 'Пробный период' : sub.plan.name,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            _row('Устройств', '${account.devicesUsed} из ${account.devicesLimit}'),
            _row('Статус', _statusLabel(sub.status)),
            _row(
              canceled ? 'Доступ до' : 'Действует до',
              _fmt(sub.currentPeriodEnd),
            ),
            if (!_isTrial)
              _row('Автопродление', sub.autoRenew ? 'включено' : 'выключено'),
            if (sub.nextPlan != null)
              _row('Со следующего периода', sub.nextPlan!.name),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Color(0xFF8B98A5))),
            Flexible(
              child: Text(
                value,
                textAlign: TextAlign.right,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );

  static String _statusLabel(String status) {
    switch (status) {
      case 'active':
        return 'активна';
      case 'canceled':
        return 'отменена (до конца периода)';
      case 'past_due':
        return 'ожидает оплаты';
      case 'pending':
        return 'ожидает оплаты';
      case 'expired':
        return 'истекла';
      default:
        return status;
    }
  }

  static String _fmt(DateTime? d) => d == null
      ? '—'
      : '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
}

class _InactiveCard extends StatelessWidget {
  const _InactiveCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(18),
        child: Row(
          children: [
            Icon(Icons.error_outline, color: Color(0xFFE5484D)),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Подписка неактивна',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
