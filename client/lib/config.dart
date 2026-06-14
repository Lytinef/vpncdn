/// Глобальная конфигурация клиента.
class AppConfig {
  /// Базовый URL API. Переопределяется при сборке:
  /// flutter build apk --dart-define=API_BASE_URL=https://api.example.com
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000', // 10.0.2.2 — localhost хоста для эмулятора Android
  );

  static String get apiUrl => '$apiBaseUrl/api';

  /// Страница входа через Telegram (открывается в WebView).
  static String get telegramLoginUrl => '$apiUrl/auth/tg-login';

  /// Deeplink-схема приложения (возврат после входа/оплаты).
  static const String deepLinkScheme = 'vpncdn';

  /// Интервал обновления метрик на главном экране, мс.
  static const int statsIntervalMs = 1500;
}
