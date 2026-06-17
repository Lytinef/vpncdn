import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:app_links/app_links.dart';

import 'app.dart';
import 'config.dart';
import 'services/secure_store.dart';
import 'services/api_client.dart';
import 'services/api.dart';
import 'services/settings_store.dart';
import 'services/vpn_engine.dart';
import 'state/auth_controller.dart';
import 'state/vpn_controller.dart';
import 'state/update_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final settings = SettingsStore();
  await settings.init();

  final store = SecureStore();
  final client = ApiClient(store);
  final api = Api(client);

  final auth = AuthController(api, store);
  final vpn = VpnController(api, VpnEngine(), settings);
  final update = UpdateController(api);

  // Принудительный разлогин при окончательной потере сессии.
  client.onUnauthorized = auth.forceSignOut;

  await auth.bootstrap();
  await vpn.init();
  // Проверка версии в фоне — не блокирует запуск.
  update.check();

  // Слушаем deeplink vpncdn://auth?access=...&refresh=... из WebView входа.
  final appLinks = AppLinks();
  appLinks.uriLinkStream.listen((uri) {
    if (uri.scheme == AppConfig.deepLinkScheme && uri.host == 'auth') {
      final access = uri.queryParameters['access'];
      final refresh = uri.queryParameters['refresh'];
      if (access != null && refresh != null) {
        auth.completeLogin(access, refresh);
      }
    }
  });

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: vpn),
        ChangeNotifierProvider.value(value: update),
        Provider.value(value: api),
        Provider.value(value: settings),
      ],
      child: const VpnApp(),
    ),
  );
}
