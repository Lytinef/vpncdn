import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../config.dart';
import '../../models/models.dart';
import '../../services/api.dart';
import '../../state/auth_controller.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  List<Plan> _plans = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<Api>();
    try {
      _plans = await api.plans();
    } catch (e) {
      _error = e.toString();
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final sub = auth.account?.subscription;
    final hasSub = auth.hasActiveSubscription;

    return Scaffold(
      appBar: AppBar(title: const Text('Подписка')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                if (hasSub) _current(context, sub!),
                if (hasSub) const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Text('Сменить тариф (со следующего периода)',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                ),
                ..._plans.map((p) => _planCard(context, p, sub, hasSub)),
              ],
            ),
    );
  }

  Widget _current(BuildContext context, Subscription sub) {
    final canceled = sub.cancelAtPeriodEnd;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(sub.plan.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('${sub.plan.deviceLimit} устройств · ${sub.plan.priceRub} ₽/мес',
                style: const TextStyle(color: Color(0xFF8B98A5))),
            const SizedBox(height: 8),
            Text(canceled
                ? 'Отменена. Доступ до ${_fmt(sub.currentPeriodEnd)}'
                : 'Активна. Продление ${_fmt(sub.currentPeriodEnd)}'),
            if (sub.nextPlan != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Со следующего периода: ${sub.nextPlan!.name}',
                    style: const TextStyle(color: Color(0xFF3B82F6))),
              ),
            const SizedBox(height: 12),
            if (canceled)
              FilledButton(
                onPressed: () => _action(context, (api) => api.resumeSubscription()),
                child: const Text('Возобновить подписку'),
              )
            else
              OutlinedButton(
                onPressed: () => _confirmCancel(context),
                child: const Text('Отменить подписку'),
              ),
          ],
        ),
      ),
    );
  }

  Widget _planCard(BuildContext context, Plan p, Subscription? sub, bool hasSub) {
    final isCurrent = sub?.plan.code == p.code;
    return Card(
      child: ListTile(
        title: Text('${p.name} · ${p.priceRub} ₽/мес'),
        subtitle: Text('${p.deviceLimit} ${_devicesWord(p.deviceLimit)}'),
        trailing: isCurrent
            ? const Chip(label: Text('текущий'))
            : FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(110, 40)),
                onPressed: () => hasSub ? _changePlan(context, p) : _buy(context, p),
                child: Text(hasSub ? 'Выбрать' : 'Купить'),
              ),
      ),
    );
  }

  // ── действия ──

  Future<void> _action(BuildContext context, Future<void> Function(Api) fn) async {
    final api = context.read<Api>();
    final auth = context.read<AuthController>();
    try {
      await fn(api);
      await auth.loadAccount();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Готово')),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка: $e')),
      );
    }
  }

  void _confirmCancel(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Отменить подписку?'),
        content: const Text(
            'Доступ сохранится до конца оплаченного периода. Деньги не возвращаются.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Назад')),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _action(context, (api) => api.cancelSubscription());
            },
            child: const Text('Отменить'),
          ),
        ],
      ),
    );
  }

  void _changePlan(BuildContext context, Plan p) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Перейти на «${p.name}»?'),
        content: const Text('Новый тариф вступит в силу со следующего периода.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Назад')),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _action(context, (api) => api.changePlan(p.code));
            },
            child: const Text('Сменить'),
          ),
        ],
      ),
    );
  }

  Future<void> _buy(BuildContext context, Plan p) async {
    final api = context.read<Api>();
    final auth = context.read<AuthController>();
    try {
      final res = await api.checkout(p.code);
      final url = res['confirmationUrl'] as String?;
      final paymentId = res['paymentId'] as String;
      if (url == null) throw Exception('Нет ссылки оплаты');
      if (!mounted) return;
      final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => _PaymentWebView(url: url)),
      );
      if (ok == true) {
        // Подтверждаем статус и обновляем аккаунт.
        await api.syncPayment(paymentId);
        await auth.loadAccount();
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Оплата обработана')),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка оплаты: $e')),
      );
    }
  }

  static String _fmt(DateTime? d) => d == null
      ? '—'
      : '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

  static String _devicesWord(int n) {
    if (n == 1) return 'устройство';
    if (n >= 2 && n <= 4) return 'устройства';
    return 'устройств';
  }
}

/// WebView оплаты YooKassa: ловим возврат на deeplink return_url.
class _PaymentWebView extends StatefulWidget {
  final String url;
  const _PaymentWebView({required this.url});

  @override
  State<_PaymentWebView> createState() => _PaymentWebViewState();
}

class _PaymentWebViewState extends State<_PaymentWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (req) {
            if (req.url.startsWith('${AppConfig.deepLinkScheme}://payment')) {
              Navigator.of(context).pop(true);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Оплата')),
      body: WebViewWidget(controller: _controller),
    );
  }
}
