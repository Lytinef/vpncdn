import 'dart:convert';
import 'package:cryptography/cryptography.dart';

/// Генерация WireGuard/AmneziaWG-пары ключей (Curve25519).
/// Ключи в формате WG: base64 от 32 «сырых» байт. Приватный не покидает устройство.
class WgKeys {
  static final _x25519 = X25519();

  static Future<Map<String, String>> generate() async {
    final kp = await _x25519.newKeyPair();
    final priv = await kp.extractPrivateKeyBytes();
    final pub = await kp.extractPublicKey();
    return {
      'private': base64.encode(priv),
      'public': base64.encode(pub.bytes),
    };
  }
}
