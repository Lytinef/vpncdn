import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { TelegramConfig } from '../../config/configuration';
import { PAYMENT_SUCCEEDED, PaymentSucceededEvent } from '../../common/events';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentMethodsService } from '../payments/payment-methods.service';
import { PaymentPurpose } from '../payments/entities/payment.entity';
import { DevicesService } from '../devices/devices.service';
import { DevicePlatform } from '../devices/entities/device.entity';
import { LoginCodeService } from '../auth/login-code.service';
import { PlanCode } from '../subscriptions/entities/plan.entity';
import * as ui from './bot.ui';

/** Платные тарифы, которые можно купить/выбрать в боте (без trial). */
const PURCHASABLE: PlanCode[] = [PlanCode.START, PlanCode.STANDARD, PlanCode.FAMILY];

/**
 * Telegram-бот: личный кабинет в чате — подписка, оплата (redirect YooKassa),
 * смена тарифа, автопродление, устройства. Запускается в long-polling при старте
 * приложения, если задан TELEGRAM_BOT_TOKEN.
 */
@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private readonly cfg: TelegramConfig;
  private bot: Bot | null = null;

  /** Пользователи, включившие автопродление без карты — после привязки карты
   *  автопродление включится автоматически (см. notifyPaymentSucceeded). */
  private readonly pendingAutopay = new Set<string>();

  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly subs: SubscriptionsService,
    private readonly payments: PaymentsService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly devices: DevicesService,
    private readonly loginCodes: LoginCodeService,
  ) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
  }

  onModuleInit(): void {
    if (!this.cfg.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN не задан — Telegram-бот выключен');
      return;
    }
    const bot = new Bot(this.cfg.botToken);
    this.bot = bot;
    this.register(bot);
    bot.catch((err) => this.logger.error(`Ошибка бота: ${String(err.error ?? err)}`));
    // Long-polling в фоне — не блокируем bootstrap приложения.
    void this.launch(bot);
  }

  private async launch(bot: Bot): Promise<void> {
    try {
      // Снимаем возможный вебхук — иначе long-polling вернёт 409.
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      await bot.start({
        onStart: (info) => this.logger.log(`Telegram-бот запущен: @${info.username}`),
      });
    } catch (e) {
      this.logger.error(`Не удалось запустить бота: ${String(e)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot) await this.bot.stop().catch(() => undefined);
  }

  // ── Регистрация обработчиков ─────────────────────────────

  private register(bot: Bot): void {
    bot.command('start', (ctx) => this.guard(ctx, () => this.onStart(ctx)));
    bot.command('menu', (ctx) => this.guard(ctx, () => this.showMenu(ctx)));

    bot.callbackQuery('menu:main', (ctx) => this.guard(ctx, () => this.showMenu(ctx)));
    bot.callbackQuery('menu:cat:connect', (ctx) =>
      this.guard(ctx, () =>
        this.render(
          ctx,
          '🔌 <b>Подключение</b>\n\nКонфиг для приложений, вход в приложение Unway и ваши устройства.',
          ui.connectMenuKeyboard(),
        ),
      ),
    );
    bot.callbackQuery('menu:cat:billing', (ctx) =>
      this.guard(ctx, () =>
        this.render(
          ctx,
          '💳 <b>Подписка и оплата</b>\n\nСтатус подписки, тарифы, смена тарифа и привязка карты.',
          ui.billingMenuKeyboard(),
        ),
      ),
    );
    bot.callbackQuery('menu:status', (ctx) => this.guard(ctx, () => this.showStatus(ctx)));
    bot.callbackQuery('menu:login', (ctx) => this.guard(ctx, () => this.showLoginCode(ctx)));
    bot.callbackQuery('menu:config', (ctx) => this.guard(ctx, () => this.showConfigConfirm(ctx)));
    bot.callbackQuery('config:add', (ctx) => this.guard(ctx, () => this.addConfig(ctx)));
    bot.callbackQuery('menu:bindcard', (ctx) => this.guard(ctx, () => this.showBindCard(ctx)));
    bot.callbackQuery('menu:plans', (ctx) => this.guard(ctx, () => this.showPlans(ctx)));
    bot.callbackQuery('menu:change', (ctx) => this.guard(ctx, () => this.showChange(ctx)));
    bot.callbackQuery('menu:devices', (ctx) => this.guard(ctx, () => this.showDevices(ctx)));
    bot.callbackQuery('menu:support', (ctx) => this.guard(ctx, () => this.showSupport(ctx)));

    bot.callbackQuery('autopay:on', (ctx) => this.guard(ctx, () => this.setAutopay(ctx, true)));
    bot.callbackQuery('autopay:off', (ctx) => this.guard(ctx, () => this.setAutopay(ctx, false)));

    bot.callbackQuery(/^buy:(.+)$/, (ctx) =>
      this.guard(ctx, () => this.onBuy(ctx, ctx.match[1])),
    );
    bot.callbackQuery(/^change:(.+)$/, (ctx) =>
      this.guard(ctx, () => this.onChange(ctx, ctx.match[1])),
    );
    bot.callbackQuery(/^dev:rm:(.+)$/, (ctx) =>
      this.guard(ctx, () => this.onRemoveDevice(ctx, ctx.match[1])),
    );

    // Любое прочее сообщение — показать меню.
    bot.on('message:text', (ctx) => this.guard(ctx, () => this.showMenu(ctx)));
  }

  // ── Обработчики ──────────────────────────────────────────

  private async onStart(ctx: Context): Promise<void> {
    const user = await this.ensureUser(ctx);
    const sub = await this.subs.getActive(user.id);
    const onTrial = sub?.plan?.code === PlanCode.TRIAL;
    const hello =
      `👋 Добро пожаловать в <b>${ui.BRAND}</b>!\n\n` +
      (onTrial
        ? 'Вам активирован <b>пробный период на 3 дня</b> (1 устройство). ' +
          'Оформить тариф можно в любой момент — платные дни добавятся после пробных.'
        : 'Здесь — ваш личный кабинет: подписка, оплата и устройства.');
    await ctx.reply(hello, { parse_mode: 'HTML', reply_markup: ui.mainMenuKeyboard() });
  }

  private async showMenu(ctx: Context): Promise<void> {
    await this.render(ctx, `🏠 <b>${ui.BRAND}</b> — меню`, ui.mainMenuKeyboard());
  }

  private async showStatus(ctx: Context): Promise<void> {
    const userId = await this.getUserId(ctx);
    const sub = await this.subs.getActive(userId);
    const card = await this.paymentMethods.getDefault(userId);
    await this.render(ctx, ui.statusText(sub, card?.cardLast4 ?? null), ui.statusKeyboard(sub));
  }

  private async showPlans(ctx: Context): Promise<void> {
    const userId = await this.getUserId(ctx);
    const sub = await this.subs.getActive(userId);
    const hasPaid = !!sub && sub.plan?.code !== PlanCode.TRIAL;
    if (hasPaid) {
      await this.render(
        ctx,
        '💳 <b>Тарифы</b>\n\nУ вас уже есть активный тариф. Для перехода используйте «Сменить тариф».',
        ui.backKeyboard('menu:cat:billing'),
      );
      return;
    }
    const plans = await this.subs.listActivePlans();
    const onTrial = !!sub && sub.plan?.code === PlanCode.TRIAL;
    const head =
      '💳 <b>Выберите тариф</b>\n\n' +
      'Цена — за 1 месяц, далее автопродление каждый месяц. Число устройств указано в названии тарифа.' +
      (onTrial ? '\n\nПлатный период начнётся после пробного — пробные дни не сгорают.' : '');
    await this.render(ctx, head, ui.plansKeyboard(plans, 'buy'));
  }

  private async onBuy(ctx: Context, codeStr: string): Promise<void> {
    const userId = await this.getUserId(ctx);
    const code = this.parsePlan(codeStr);
    const returnUrl = this.cfg.botUsername
      ? `https://t.me/${this.cfg.botUsername}`
      : undefined;
    const checkout = await this.payments.createCheckout(userId, code, returnUrl);
    if (!checkout.confirmationUrl) {
      throw new Error('Не удалось создать ссылку на оплату, попробуйте позже');
    }
    const kb = new InlineKeyboard()
      .url(`💳 Оплатить ${checkout.amountRub} ₽`, checkout.confirmationUrl)
      .row()
      .text('⬅️ В меню', 'menu:main');
    await this.render(
      ctx,
      `Счёт на <b>${checkout.amountRub} ₽</b> создан.\n\n` +
        'Нажмите «Оплатить» и завершите оплату — подписка активируется автоматически, ' +
        'я пришлю подтверждение сюда.',
      kb,
    );
  }

  private async showChange(ctx: Context): Promise<void> {
    const userId = await this.getUserId(ctx);
    const sub = await this.subs.getActive(userId);
    if (!sub || sub.plan?.code === PlanCode.TRIAL) {
      const plans = await this.subs.listActivePlans();
      await this.render(
        ctx,
        '🔄 Смена тарифа доступна при активном платном тарифе.\nСначала оформите подписку:',
        ui.plansKeyboard(plans, 'buy'),
      );
      return;
    }
    const plans = await this.subs.listActivePlans();
    const text =
      '🔄 <b>Смена тарифа</b>\n\n' +
      `Текущий: <b>${sub.plan.name}</b> · ${sub.plan.deviceLimit} устр.\n` +
      'Новый тариф вступит в силу со следующего периода; оплата — за месяц. ' +
      'Выберите текущий тариф, чтобы отменить запланированную смену.' +
      (sub.nextPlan ? `\n\nЗапланировано: <b>${sub.nextPlan.name}</b>.` : '');
    await this.render(ctx, text, ui.plansKeyboard(plans, 'change', sub.plan.code));
  }

  private async onChange(ctx: Context, codeStr: string): Promise<void> {
    const userId = await this.getUserId(ctx);
    const code = this.parsePlan(codeStr);
    const sub = await this.subs.changePlan(userId, code);
    const text = sub.nextPlan
      ? `✅ Со следующего периода тариф изменится на <b>${sub.nextPlan.name}</b>.`
      : `✅ Запланированная смена отменена — останется <b>${sub.plan.name}</b>.`;
    await this.render(ctx, text, ui.backKeyboard('menu:cat:billing'));
  }

  private async setAutopay(ctx: Context, on: boolean): Promise<void> {
    const userId = await this.getUserId(ctx);
    if (!on) {
      const sub = await this.subs.cancelAtPeriodEnd(userId);
      await this.render(
        ctx,
        `✅ Автопродление отключено. Доступ сохранится до <b>${ui.fmtDate(
          sub.currentPeriodEnd,
        )}</b>, дальше списаний не будет.`,
        ui.statusKeyboard(sub),
      );
      return;
    }
    // Включение автопродления требует привязанной карты. Нет карты —
    // отправляем на привязку, автопродление включится после неё.
    const card = await this.paymentMethods.getDefault(userId);
    if (!card) {
      this.pendingAutopay.add(userId);
      await this.showBindCard(ctx, true);
      return;
    }
    const sub = await this.subs.enableAutoRenew(userId);
    await this.render(
      ctx,
      `✅ Автопродление включено. Тариф «${sub.plan.name}» продлится автоматически.`,
      ui.statusKeyboard(sub),
    );
  }

  private async showDevices(ctx: Context): Promise<void> {
    const userId = await this.getUserId(ctx);
    const devices = await this.devices.listForUser(userId);
    await this.render(ctx, ui.devicesText(devices), ui.devicesKeyboard(devices));
  }

  private async onRemoveDevice(ctx: Context, deviceId: string): Promise<void> {
    const userId = await this.getUserId(ctx);
    await this.devices.remove(userId, deviceId);
    const devices = await this.devices.listForUser(userId);
    await this.render(
      ctx,
      '🗑 Устройство удалено.\n\n' + ui.devicesText(devices),
      ui.devicesKeyboard(devices),
    );
  }

  private async showSupport(ctx: Context): Promise<void> {
    await this.render(ctx, ui.SUPPORT_TEXT, ui.backKeyboard());
  }

  private async showBindCard(ctx: Context, forAutopay = false): Promise<void> {
    const userId = await this.getUserId(ctx);
    const returnUrl = this.cfg.botUsername
      ? `https://t.me/${this.cfg.botUsername}`
      : undefined;
    const checkout = await this.payments.createCardBinding(userId, returnUrl);
    if (!checkout.confirmationUrl) {
      throw new Error('Не удалось создать ссылку, попробуйте позже');
    }
    const kb = new InlineKeyboard()
      .url(`💳 Привязать карту (${checkout.amountRub} ₽)`, checkout.confirmationUrl)
      .row()
      .text('⬅️ Назад', 'menu:cat:billing');
    const head = forAutopay
      ? '💳 <b>Нужна привязанная карта</b>\n\n' +
        'Для автопродления привяжите карту — после привязки автопродление ' +
        'включится автоматически.\n\n'
      : '💳 <b>Привязка карты</b>\n\n';
    await this.render(
      ctx,
      head +
        `Спишем <b>${checkout.amountRub} ₽</b> для привязки и сразу вернём. ` +
        'Новая карта заменит прежнюю — с неё будут идти автосписания.',
      kb,
    );
  }

  private async showConfigConfirm(ctx: Context): Promise<void> {
    const userId = await this.getUserId(ctx);
    const limit = await this.subs.getEffectiveDeviceLimit(userId);
    if (limit <= 0) {
      await this.render(
        ctx,
        '📲 <b>Конфиг</b>\n\nНет активной подписки — оформите тариф, чтобы получить конфиг.',
        ui.backKeyboard('menu:cat:connect'),
      );
      return;
    }
    const used = await this.devices.countActive(userId);
    if (used >= limit) {
      await this.render(
        ctx,
        `📲 <b>Конфиг</b>\n\nДостигнут лимит устройств (${used} из ${limit}). ` +
          'Освободите слот в «📱 Мои устройства».',
        ui.backKeyboard('menu:cat:connect'),
      );
      return;
    }
    const kb = new InlineKeyboard()
      .text('✅ Добавить', 'config:add')
      .text('⬅️ Отменить', 'menu:cat:connect');
    await this.render(
      ctx,
      '📲 <b>Новый конфиг</b>\n\n' +
        'Создадим конфиг для стороннего приложения (Happ, v2rayNG…). ' +
        `Он займёт одно устройство тарифа (сейчас занято ${used} из ${limit}).\n\n` +
        'Добавить?',
      kb,
    );
  }

  private async addConfig(ctx: Context): Promise<void> {
    const userId = await this.getUserId(ctx);
    const device = await this.devices.register(userId, {
      name: 'Внешний конфиг',
      platform: DevicePlatform.IOS,
    });
    const conn = await this.devices.getConnection(userId, device.id);
    const directBlock = conn.direct
      ? '\n\n🚀 <b>Напрямую</b> (быстрее, ниже пинг; если не работает — используйте «Обход»):\n\n' +
        `<code>${ui.escapeHtml(conn.direct.uri)}</code>`
      : '';
    await this.render(
      ctx,
      '📲 <b>Конфиг готов</b>\n\n' +
        'Импортируйте ссылку в клиент с поддержкой VLESS (Happ, v2RayTun, v2rayNG). ' +
        'Обе ссылки — одно устройство тарифа.\n\n' +
        '🛡 <b>Обход</b> (обход блокировок, стабильно):\n\n' +
        `<code>${ui.escapeHtml(conn.cdn.uri)}</code>` +
        directBlock +
        '\n\nУчитывается в лимите устройств — удалить можно в «📱 Мои устройства».',
      ui.backKeyboard('menu:cat:connect'),
    );
  }

  private async showLoginCode(ctx: Context): Promise<void> {
    const userId = await this.getUserId(ctx);
    const { code, expiresAt } = await this.loginCodes.issue(userId);
    const mins = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
    await this.render(
      ctx,
      '🔐 <b>Код для входа в приложение</b>\n\n' +
        `<code>${code}</code>\n\n` +
        `Введите его в приложении Unway. Код одноразовый и действует ${mins} мин.`,
      ui.backKeyboard('menu:cat:connect'),
    );
  }

  // ── Уведомления (подписка на события) ────────────────────

  @OnEvent(PAYMENT_SUCCEEDED)
  async notifyPaymentSucceeded(ev: PaymentSucceededEvent): Promise<void> {
    if (!this.bot) return;
    try {
      const user = await this.users.findById(ev.userId);
      if (!user) return;
      if (ev.purpose === PaymentPurpose.BIND_CARD) {
        // Если карту привязывали ради автопродления — включаем его.
        if (this.pendingAutopay.delete(ev.userId)) {
          try {
            const sub = await this.subs.enableAutoRenew(ev.userId);
            await this.bot.api.sendMessage(
              user.telegramId,
              '✅ <b>Карта привязана, автопродление включено.</b>\n\n' +
                `Тариф «${sub.plan.name}» продлится автоматически. ` +
                'Списанная при привязке сумма вернётся.',
              { parse_mode: 'HTML', reply_markup: ui.statusKeyboard(sub) },
            );
            return;
          } catch (e) {
            this.logger.warn(`Не удалось включить автопродление ${ev.userId}: ${String(e)}`);
          }
        }
        await this.bot.api.sendMessage(
          user.telegramId,
          '✅ <b>Карта привязана.</b> Списанная сумма вернётся; автосписания пойдут с новой карты.',
          { parse_mode: 'HTML', reply_markup: ui.mainMenuKeyboard() },
        );
        return;
      }
      const sub = await this.subs.getActive(ev.userId);
      const card = await this.paymentMethods.getDefault(ev.userId);
      await this.bot.api.sendMessage(
        user.telegramId,
        '✅ <b>Оплата получена!</b>\n\n' + ui.statusText(sub, card?.cardLast4 ?? null),
        { parse_mode: 'HTML', reply_markup: ui.statusKeyboard(sub) },
      );
    } catch (e) {
      this.logger.warn(`Не удалось уведомить об оплате ${ev.userId}: ${String(e)}`);
    }
  }

  // ── Массовая рассылка ────────────────────────────────────

  /** Отправляет сообщение всем незаблокированным пользователям (для админки). */
  async broadcast(
    text: string,
  ): Promise<{ total: number; sent: number; failed: number }> {
    if (!this.bot) throw new Error('Бот не запущен');
    const recipients = await this.users.listTelegramRecipients();
    let sent = 0;
    let failed = 0;
    for (const tgId of recipients) {
      try {
        await this.bot.api.sendMessage(tgId, text, { parse_mode: 'HTML' });
        sent++;
      } catch (e) {
        failed++;
        this.logger.warn(`Рассылка → ${tgId} не доставлено: ${String(e)}`);
      }
      // Лимит Telegram ~30 сообщений/сек — держим ~20/сек во избежание 429.
      await new Promise((r) => setTimeout(r, 50));
    }
    this.logger.log(
      `Рассылка завершена: отправлено ${sent}/${recipients.length}, ошибок ${failed}`,
    );
    return { total: recipients.length, sent, failed };
  }

  // ── Вспомогательное ──────────────────────────────────────

  /** Единая обёртка: ловит ошибки и аккуратно показывает их пользователю. */
  private async guard(ctx: Context, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Произошла ошибка';
      this.logger.warn(`Ошибка обработчика: ${msg}`);
      if (ctx.callbackQuery) {
        await ctx
          .answerCallbackQuery({ text: msg, show_alert: true })
          .catch(() => undefined);
      } else {
        await ctx.reply(`⚠️ ${msg}`).catch(() => undefined);
      }
    }
  }

  /** Рендер экрана: для callback — редактируем сообщение, иначе отправляем новое. */
  private async render(ctx: Context, text: string, kb: InlineKeyboard): Promise<void> {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery().catch(() => undefined);
      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
      } catch {
        // Например, "message is not modified" или сообщение слишком старое.
        await ctx
          .reply(text, { parse_mode: 'HTML', reply_markup: kb })
          .catch(() => undefined);
      }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  private async getUserId(ctx: Context): Promise<string> {
    const tgId = ctx.from?.id;
    if (!tgId) throw new Error('Не удалось определить пользователя');
    const user = await this.users.findByTelegramId(String(tgId));
    return user ? user.id : (await this.ensureUser(ctx)).id;
  }

  /** Upsert пользователя по данным чата + выдача пробного периода (идемпотентно). */
  private async ensureUser(ctx: Context) {
    const f = ctx.from!;
    const user = await this.users.upsertFromTelegram({
      id: f.id,
      first_name: f.first_name,
      last_name: f.last_name,
      username: f.username,
    });
    await this.subs.grantTrialIfNew(user.id).catch(() => undefined);
    return user;
  }

  private parsePlan(code: string): PlanCode {
    if (!PURCHASABLE.includes(code as PlanCode)) {
      throw new Error('Неизвестный тариф');
    }
    return code as PlanCode;
  }
}
