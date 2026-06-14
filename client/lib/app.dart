import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'theme.dart';
import 'state/auth_controller.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/home_screen.dart';

class VpnApp extends StatelessWidget {
  const VpnApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Unway',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: Consumer<AuthController>(
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
      ),
    );
  }
}
