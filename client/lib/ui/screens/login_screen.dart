import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/auth_controller.dart';
import '../../state/vpn_controller.dart';
import '../../services/vpn_engine.dart';

/// Вход по постоянному коду доступа (выдаётся в личном кабинете боте). Внизу —
/// SOS VPN: экстренный выход в сеть без входа (CDN, лимит 100 МБ).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _codeCtrl = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _codeCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<AuthController>().loginWithCode(code);
      // Успех — AuthController сам переключит экран на главный.
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// SOS VPN: подключение без входа (CDN, лимит 100 МБ по устройству) — чтобы
  /// без интернета достучаться до бота/оплаты и получить код.
  Future<void> _sos() async {
    final vpn = context.read<VpnController>();
    setState(() => _error = null);
    await vpn.sosConnect();
    if (mounted && vpn.error != null) setState(() => _error = vpn.error);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const Icon(Icons.vpn_lock, size: 72, color: Color(0xFF3B82F6)),
              const SizedBox(height: 24),
              Text(
                'Unway',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              const Text(
                'Введите код доступа из вашего личного кабинета.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF8B98A5)),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _codeCtrl,
                textAlign: TextAlign.center,
                textCapitalization: TextCapitalization.characters,
                autocorrect: false,
                enabled: !_busy,
                style: const TextStyle(fontSize: 22, letterSpacing: 4),
                decoration: const InputDecoration(
                  hintText: 'КОД',
                  border: OutlineInputBorder(),
                ),
                onSubmitted: (_) => _submit(),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFFE5484D)),
                  ),
                ),
              const Spacer(),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Войти'),
              ),
              const SizedBox(height: 12),
              // SOS VPN — экстренный выход в сеть без входа (CDN, лимит 100 МБ),
              // чтобы открыть бота/оплату и получить код.
              Consumer<VpnController>(
                builder: (_, vpn, __) {
                  final connecting = vpn.stage == VpnStage.connecting;
                  final connected = vpn.isConnected;
                  return OutlinedButton.icon(
                    onPressed: (_busy || connecting) ? null : _sos,
                    icon: const Text('🆘'),
                    label: Text(
                      connected
                          ? 'SOS VPN подключён (лимит 100 МБ)'
                          : connecting
                              ? 'Подключение SOS…'
                              : 'SOS VPN — выйти в сеть без входа',
                    ),
                  );
                },
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
