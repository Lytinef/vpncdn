import { InlineKeyboard } from 'grammy';
import { kopecksToRubles } from '../../common/money';
import { Plan, PlanCode } from '../subscriptions/entities/plan.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/entities/subscription.entity';
import { Device } from '../devices/entities/device.entity';

export const BRAND = 'Unway';

export const SUPPORT_TEXT =
  `🆘 <b>Поддержка ${BRAND}</b>\n\n` +
  'Если возникли вопросы по оплате или подключению — напишите нам, поможем.\n\n' +
  '📧 support@lytinef.ru';

const PLATFORM_LABEL: Record<string, string> = {
  android: 'Android',
  ios: 'iOS',
  windows: 'Windows',
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.PENDING]: 'ожидает оплаты',
  [SubscriptionStatus.ACTIVE]: 'активна',
  [SubscriptionStatus.PAST_DUE]: 'просрочена',
  [SubscriptionStatus.CANCELED]: 'отменена (до конца периода)',
  [SubscriptionStatus.EXPIRED]: 'истекла',
};

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const fmtDate = (d?: Date | null): string =>
  d
    ? new Date(d).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

const fmtDateTime = (d?: Date | null): string =>
  d
    ? new Date(d).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const isTrial = (sub: Subscription | null): boolean =>
  sub?.plan?.code === PlanCode.TRIAL;

// ── Клавиатуры ─────────────────────────────────────────────

// Главное меню — категории, чтобы не было простыни кнопок.
export const mainMenuKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text('🔌 Подключение', 'menu:cat:connect')
    .row()
    .text('💳 Подписка и оплата', 'menu:cat:billing')
    .row()
    .text('🆘 Помощь', 'menu:support');

// Категория «Подключение»: получить конфиг, вход в приложение, устройства.
export const connectMenuKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text('📲 Получить конфиг', 'menu:config')
    .row()
    .text('🔐 Войти в приложение', 'menu:login')
    .row()
    .text('📱 Мои устройства', 'menu:devices')
    .row()
    .text('⬅️ В меню', 'menu:main');

// Категория «Подписка и оплата».
export const billingMenuKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text('📊 Моя подписка', 'menu:status')
    .row()
    .text('💳 Тарифы и оплата', 'menu:plans')
    .row()
    .text('🔄 Сменить тариф', 'menu:change')
    .row()
    .text('💳 Привязать карту', 'menu:bindcard')
    .row()
    .text('⬅️ В меню', 'menu:main');

export const backKeyboard = (): InlineKeyboard =>
  new InlineKeyboard().text('⬅️ В меню', 'menu:main');

export function statusKeyboard(sub: Subscription | null): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (!sub || sub.status === SubscriptionStatus.EXPIRED) {
    kb.text('💳 Купить подписку', 'menu:plans').row();
  } else if (isTrial(sub)) {
    kb.text('💳 Оформить тариф', 'menu:plans').row();
  } else {
    kb.text('🔄 Сменить тариф', 'menu:change').row();
    if (sub.status === SubscriptionStatus.CANCELED) {
      kb.text('▶️ Возобновить подписку', 'autopay:on').row();
    } else if (sub.autoRenew) {
      kb.text('⏸ Отключить автопродление', 'autopay:off').row();
    }
  }
  return kb.text('⬅️ В меню', 'menu:main');
}

export function plansKeyboard(
  plans: Plan[],
  action: 'buy' | 'change',
  currentCode?: PlanCode,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of plans) {
    const mark = p.code === currentCode ? ' ✓' : '';
    kb.text(
      `${p.name} · ${p.deviceLimit} устр. — ${kopecksToRubles(p.priceKopecks)} ₽/мес${mark}`,
      `${action}:${p.code}`,
    ).row();
  }
  return kb.text('⬅️ В меню', 'menu:main');
}

export function devicesKeyboard(devices: Device[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const d of devices) {
    kb.text(`🗑 Удалить «${d.name}»`, `dev:rm:${d.id}`).row();
  }
  return kb.text('⬅️ В меню', 'menu:main');
}

// ── Тексты ─────────────────────────────────────────────────

export function statusText(sub: Subscription | null, cardLast4?: string | null): string {
  if (!sub) {
    return (
      '📊 <b>Подписка</b>\n\n' +
      `У вас нет активной подписки. Оформите тариф, чтобы пользоваться ${BRAND}.`
    );
  }
  const trial = isTrial(sub);
  const lines = ['📊 <b>Ваша подписка</b>', ''];
  lines.push(`Тариф: <b>${trial ? 'Пробный период' : sub.plan.name}</b>`);
  lines.push(`Устройств: <b>${sub.plan.deviceLimit}</b>`);
  lines.push(`Статус: <b>${STATUS_LABEL[sub.status]}</b>`);
  lines.push(`Действует до: <b>${fmtDate(sub.currentPeriodEnd)}</b>`);
  if (!trial) {
    lines.push(`Автопродление: <b>${sub.autoRenew ? 'включено' : 'выключено'}</b>`);
  }
  if (cardLast4 !== undefined) {
    lines.push(`Карта: <b>${cardLast4 ? '•••• ' + cardLast4 : 'не привязана'}</b>`);
  }
  if (sub.nextPlan) {
    lines.push(`Со следующего периода: <b>${sub.nextPlan.name}</b>`);
  }
  if (trial) {
    lines.push(
      '',
      'При оформлении тарифа платный период начнётся <b>после пробного</b> — пробные дни не сгорают.',
    );
  }
  return lines.join('\n');
}

export function devicesText(devices: Device[]): string {
  if (!devices.length) {
    return '📱 <b>Ваши устройства</b>\n\nПока нет подключённых устройств.';
  }
  const lines = ['📱 <b>Ваши устройства</b>', ''];
  devices.forEach((d, i) => {
    const platform = PLATFORM_LABEL[d.platform] ?? d.platform;
    lines.push(`${i + 1}. <b>${escapeHtml(d.name)}</b> · ${platform}`);
    lines.push(`    активность: ${fmtDateTime(d.lastSeenAt)}`);
  });
  return lines.join('\n');
}
