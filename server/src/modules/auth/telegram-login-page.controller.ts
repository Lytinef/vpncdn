import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramConfig } from '../../config/configuration';

/**
 * HTML-страница входа через Telegram Login Widget.
 * Клиент (мобильный/десктоп) открывает её в WebView; после успешной авторизации
 * страница обменивает данные на JWT через /api/auth/telegram и редиректит в
 * приложение по deeplink vpncdn://auth?access=...&refresh=...
 *
 * В BotFather у бота должен быть задан домен Login Widget = домен этого API.
 */
@Controller('auth/tg-login')
export class TelegramLoginPageController {
  private readonly cfg: TelegramConfig;

  constructor(config: ConfigService) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  page(): string {
    const bot = this.cfg.botUsername;
    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Вход через Telegram</title>
<style>
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
       font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1419;color:#e6edf3}
  .box{text-align:center;padding:24px}
  .muted{color:#8b98a5;margin-top:16px;font-size:14px}
  .err{color:#e5484d;margin-top:16px}
</style>
</head>
<body>
  <div class="box">
    <h2>Вход в VPN-CDN</h2>
    <div id="widget"></div>
    <div id="status" class="muted">Подтвердите вход в Telegram…</div>
  </div>
  <script async src="https://telegram.org/js/telegram-widget.js?22"
    data-telegram-login="${bot}"
    data-size="large"
    data-userpic="true"
    data-request-access="write"
    data-onauth="onTelegramAuth(user)"></script>
  <script>
    async function onTelegramAuth(user) {
      const status = document.getElementById('status');
      status.textContent = 'Авторизация…';
      try {
        const res = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(user)
        });
        if (!res.ok) throw new Error('Сервер отклонил вход');
        const data = await res.json();
        const params = new URLSearchParams({
          access: data.accessToken,
          refresh: data.refreshToken
        });
        window.location.href = 'vpncdn://auth?' + params.toString();
      } catch (e) {
        status.className = 'err';
        status.textContent = 'Ошибка входа: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
  }
}
