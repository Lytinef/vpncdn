import 'package:flutter/material.dart';

const _bg = Color(0xFF0F1419);
const _surface = Color(0xFF171D26);
const _primary = Color(0xFF3B82F6);

ThemeData buildTheme() {
  final scheme = const ColorScheme.dark(
    primary: _primary,
    surface: _surface,
    background: _bg,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: _bg,
    appBarTheme: const AppBarTheme(backgroundColor: _bg, elevation: 0),
    cardTheme: CardThemeData(
      color: _surface,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
  );
}
