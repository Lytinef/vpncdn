import 'package:flutter/material.dart';

/// Баннер: изменение настроек доступно только при отключённом VPN.
class LockedBanner extends StatelessWidget {
  const LockedBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: const Color(0xFF332701),
      padding: const EdgeInsets.all(12),
      child: const Row(
        children: [
          Icon(Icons.lock_outline, color: Color(0xFFE5A50A), size: 18),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Отключите VPN, чтобы изменить эти настройки',
              style: TextStyle(color: Color(0xFFE5A50A)),
            ),
          ),
        ],
      ),
    );
  }
}
