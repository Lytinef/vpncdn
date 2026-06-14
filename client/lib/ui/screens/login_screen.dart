import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../config.dart';
import '../../state/auth_controller.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

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
              Text('Unway',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              const Text(
                'Быстрый и устойчивый VPN через CDN.\nВход через Telegram.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF8B98A5)),
              ),
              const Spacer(),
              FilledButton.icon(
                icon: const Icon(Icons.telegram),
                label: const Text('Войти через Telegram'),
                onPressed: () => _openLogin(context),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  void _openLogin(BuildContext context) {
    final auth = context.read<AuthController>();
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _TelegramWebView(auth: auth)),
    );
  }
}

class _TelegramWebView extends StatefulWidget {
  final AuthController auth;
  const _TelegramWebView({required this.auth});

  @override
  State<_TelegramWebView> createState() => _TelegramWebViewState();
}

class _TelegramWebViewState extends State<_TelegramWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (req) {
            if (req.url.startsWith('${AppConfig.deepLinkScheme}://auth')) {
              final uri = Uri.parse(req.url);
              final access = uri.queryParameters['access'];
              final refresh = uri.queryParameters['refresh'];
              if (access != null && refresh != null) {
                widget.auth.completeLogin(access, refresh);
                if (mounted) Navigator.of(context).pop();
              }
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(AppConfig.telegramLoginUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Вход через Telegram')),
      body: WebViewWidget(controller: _controller),
    );
  }
}
