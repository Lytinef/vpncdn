import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'theme.dart';
import 'state/auth_controller.dart';
import 'state/vpn_controller.dart';
import 'state/update_controller.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/home_screen.dart';
import 'ui/screens/force_update_screen.dart';

class VpnApp extends StatefulWidget {
  const VpnApp({super.key});

  @override
  State<VpnApp> createState() => _VpnAppState();
}

class _VpnAppState extends State<VpnApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Замеры пинга/скорости — только когда приложение на переднем плане.
    // В фоне туннель продолжает работать, но метрики не дёргают сеть (экономия батареи).
    context.read<VpnController>().setStatsActive(state == AppLifecycleState.resumed);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Unway',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: Consumer<UpdateController>(
        builder: (_, upd, __) {
          if (upd.mustUpdate) return ForceUpdateScreen(info: upd.info!);
          return Consumer<AuthController>(
            builder: (_, auth, __) {
              switch (auth.status) {
                case AuthStatus.unknown:
                  return const Scaffold(body: Center(child: CircularProgressIndicator()));
                case AuthStatus.signedOut:
                  return const LoginScreen();
                case AuthStatus.signedIn:
                  return const HomeScreen();
              }
            },
          );
        },
      ),
    );
  }
}
