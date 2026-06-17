import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/models.dart';

/// Экран обязательного обновления — блокирует приложение, пока не обновятся.
class ForceUpdateScreen extends StatelessWidget {
  final AppVersionInfo info;
  const ForceUpdateScreen({super.key, required this.info});

  @override
  Widget build(BuildContext context) {
    final hasUrl = (info.updateUrl ?? '').isNotEmpty;
    final notes = info.notes ?? '';
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.system_update, size: 64, color: Color(0xFF3B82F6)),
              const SizedBox(height: 20),
              const Text(
                'Требуется обновление',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              Text(
                'Установлена устаревшая версия. Обновитесь, чтобы продолжить.'
                '${info.latestVersion != null ? '\n\nАктуальная версия: ${info.latestVersion}' : ''}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF8B98A5)),
              ),
              if (notes.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(notes, textAlign: TextAlign.center),
              ],
              const SizedBox(height: 28),
              if (hasUrl)
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => launchUrl(
                      Uri.parse(info.updateUrl!),
                      mode: LaunchMode.externalApplication,
                    ),
                    child: const Text('Обновить'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
