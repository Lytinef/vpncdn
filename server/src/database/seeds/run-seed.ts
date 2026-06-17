import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { Plan, PlanCode } from '../../modules/subscriptions/entities/plan.entity';
import { AdminUser, AdminRole } from '../../modules/admin/entities/admin-user.entity';
import {
  BypassEntry,
  BypassType,
} from '../../modules/bypass/entities/bypass-entry.entity';

const PLANS: Partial<Plan>[] = [
  // Пробный период: бесплатно, 1 устройство, 3 дня. Скрыт из списка платных (isActive=false).
  { code: PlanCode.TRIAL, name: 'Пробный', priceKopecks: 0, deviceLimit: 1, durationDays: 3, isActive: false, sortOrder: 0 },
  { code: PlanCode.START, name: 'Старт', priceKopecks: 14900, deviceLimit: 1, sortOrder: 1 },
  { code: PlanCode.STANDARD, name: 'Стандарт', priceKopecks: 24900, deviceLimit: 3, sortOrder: 2 },
  { code: PlanCode.FAMILY, name: 'Семейная', priceKopecks: 34900, deviceLimit: 6, sortOrder: 3 },
];

/** Стартовый список РФ-сервисов, блокирующих доступ через VPN. */
const BYPASS: Partial<BypassEntry>[] = [
  // Банки — домены
  { type: BypassType.DOMAIN, value: 'sberbank.ru', title: 'Сбербанк', category: 'bank' },
  { type: BypassType.DOMAIN, value: 'online.sberbank.ru', title: 'Сбербанк Онлайн', category: 'bank' },
  { type: BypassType.DOMAIN, value: 'tinkoff.ru', title: 'Т-Банк', category: 'bank' },
  { type: BypassType.DOMAIN, value: 'vtb.ru', title: 'ВТБ', category: 'bank' },
  { type: BypassType.DOMAIN, value: 'alfabank.ru', title: 'Альфа-Банк', category: 'bank' },
  { type: BypassType.DOMAIN, value: 'gazprombank.ru', title: 'Газпромбанк', category: 'bank' },
  { type: BypassType.DOMAIN, value: 'open.ru', title: 'Открытие', category: 'bank' },
  { type: BypassType.DOMAIN, value: 'raiffeisen.ru', title: 'Райффайзен', category: 'bank' },
  // Госуслуги/гос
  { type: BypassType.DOMAIN, value: 'gosuslugi.ru', title: 'Госуслуги', category: 'gov' },
  { type: BypassType.DOMAIN, value: 'nalog.ru', title: 'ФНС', category: 'gov' },
  { type: BypassType.DOMAIN, value: 'nalog.gov.ru', title: 'ФНС', category: 'gov' },
  { type: BypassType.DOMAIN, value: 'mos.ru', title: 'mos.ru', category: 'gov' },
  { type: BypassType.DOMAIN, value: 'pfr.gov.ru', title: 'СФР', category: 'gov' },
  // Маркетплейсы/сервисы
  { type: BypassType.DOMAIN, value: 'wildberries.ru', title: 'Wildberries', category: 'shop' },
  { type: BypassType.DOMAIN, value: 'ozon.ru', title: 'Ozon', category: 'shop' },
  // Стриминги РФ
  { type: BypassType.DOMAIN, value: 'kinopoisk.ru', title: 'Кинопоиск', category: 'streaming' },
  { type: BypassType.DOMAIN, value: 'okko.tv', title: 'Okko', category: 'streaming' },
  { type: BypassType.DOMAIN, value: 'ivi.ru', title: 'IVI', category: 'streaming' },
  { type: BypassType.DOMAIN, value: 'premier.one', title: 'PREMIER', category: 'streaming' },
  // Банки — Android-приложения
  { type: BypassType.APP, value: 'ru.sberbankmobile', title: 'Сбербанк Онлайн', category: 'bank' },
  { type: BypassType.APP, value: 'com.idamob.tinkoff.android', title: 'Т-Банк', category: 'bank' },
  { type: BypassType.APP, value: 'ru.vtb24.mobilebanking.android', title: 'ВТБ Онлайн', category: 'bank' },
  { type: BypassType.APP, value: 'ru.alfabank.mobile.android', title: 'Альфа-Банк', category: 'bank' },
  { type: BypassType.APP, value: 'ru.gazprombank.android.mobilebank.app', title: 'Газпромбанк', category: 'bank' },
  // Госуслуги/маркетплейсы — приложения
  { type: BypassType.APP, value: 'ru.rostel', title: 'Госуслуги', category: 'gov' },
  { type: BypassType.APP, value: 'com.wildberries.ru', title: 'Wildberries', category: 'shop' },
  { type: BypassType.APP, value: 'ru.ozon.app.android', title: 'Ozon', category: 'shop' },
];

async function run() {
  await dataSource.initialize();
  // eslint-disable-next-line no-console
  console.log('Сиды: подключение к БД установлено');

  // ── Тарифы ──
  // На случай, если миграция AddTrialPlan ещё не накатана в этом окружении —
  // гарантируем наличие значения enum 'trial' до вставки тарифа (autocommit,
  // отдельной транзакцией, поэтому значением можно сразу пользоваться).
  await dataSource.query(`ALTER TYPE "plans_code_enum" ADD VALUE IF NOT EXISTS 'trial'`);
  const planRepo = dataSource.getRepository(Plan);
  for (const p of PLANS) {
    const existing = await planRepo.findOne({ where: { code: p.code } });
    if (existing) {
      await planRepo.update(existing.id, p);
    } else {
      await planRepo.save(planRepo.create(p));
    }
  }
  console.log(`Тарифы: ${PLANS.length} обработано`);

  // ── Администратор ──
  const adminRepo = dataSource.getRepository(AdminUser);
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@example.com';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'admin';
  const existingAdmin = await adminRepo.findOne({ where: { email } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(password, 10);
    await adminRepo.save(
      adminRepo.create({ email, passwordHash, role: AdminRole.SUPERADMIN, isActive: true }),
    );
    console.log(`Администратор создан: ${email}`);
  } else {
    console.log(`Администратор уже существует: ${email}`);
  }

  // ── Список обхода ──
  const bypassRepo = dataSource.getRepository(BypassEntry);
  let added = 0;
  for (const b of BYPASS) {
    const existing = await bypassRepo.findOne({ where: { type: b.type, value: b.value } });
    if (!existing) {
      await bypassRepo.save(bypassRepo.create(b));
      added++;
    }
  }
  console.log(`Список обхода: добавлено ${added}, всего в наборе ${BYPASS.length}`);

  await dataSource.destroy();
  console.log('Сиды завершены');
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Ошибка сидов:', e);
  process.exit(1);
});
