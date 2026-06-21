import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual } from 'typeorm';
import { Plan, PlanCode } from './entities/plan.entity';
import { Subscription, SubscriptionStatus } from './entities/subscription.entity';
import { TrialLedger } from './entities/trial-ledger.entity';
import { UsersService } from '../users/users.service';

/** Статусы, при которых у пользователя есть доступ к VPN (пока период не истёк). */
const ACCESS_STATUSES = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.CANCELED,
];

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
    @InjectRepository(Subscription)
    private readonly subs: Repository<Subscription>,
    @InjectRepository(TrialLedger)
    private readonly trialLedger: Repository<TrialLedger>,
    private readonly users: UsersService,
  ) {}

  listActivePlans(): Promise<Plan[]> {
    return this.plans.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
  }

  getPlanByCode(code: PlanCode): Promise<Plan | null> {
    return this.plans.findOne({ where: { code } });
  }

  getById(id: string): Promise<Subscription | null> {
    return this.subs.findOne({ where: { id } });
  }

  /** Последняя по времени подписка пользователя. */
  getLatest(userId: string): Promise<Subscription | null> {
    return this.subs.findOne({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /** Активная подписка (есть доступ и период не истёк). */
  async getActive(userId: string): Promise<Subscription | null> {
    const sub = await this.subs.findOne({
      where: { userId, status: In(ACCESS_STATUSES) },
      order: { currentPeriodEnd: 'DESC' },
    });
    if (!sub) return null;
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= Date.now()) return null;
    return sub;
  }

  hasAccess(sub: Subscription | null): boolean {
    return (
      !!sub &&
      ACCESS_STATUSES.includes(sub.status) &&
      !!sub.currentPeriodEnd &&
      sub.currentPeriodEnd.getTime() > Date.now()
    );
  }

  /** Лимит устройств по активной подписке (0 — если подписки нет). */
  async getEffectiveDeviceLimit(userId: string): Promise<number> {
    const sub = await this.getActive(userId);
    return sub ? sub.plan.deviceLimit : 0;
  }

  /** Активный (не истёкший) пробный период пользователя, если есть. */
  async getActiveTrial(userId: string): Promise<Subscription | null> {
    const subs = await this.subs.find({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });
    const now = Date.now();
    return (
      subs.find(
        (s) =>
          s.plan?.code === PlanCode.TRIAL &&
          !!s.currentPeriodEnd &&
          s.currentPeriodEnd.getTime() > now,
      ) ?? null
    );
  }

  /**
   * Выдаёт новому пользователю пробный период (план trial: 1 устройство, 3 дня).
   * Идемпотентно: если у пользователя уже есть хоть одна подписка — ничего не
   * делает (так существующие и уже покупавшие не получают повторный триал).
   * Возвращает созданную пробную подписку либо null.
   */
  async grantTrialIfNew(userId: string): Promise<Subscription | null> {
    const existing = await this.getLatest(userId);
    if (existing) return null;
    const user = await this.users.findById(userId);
    if (!user) return null;
    // Анти-абуз: триал — один раз на Telegram-аккаунт навсегда. Реестр переживает
    // удаление/пересоздание аккаунта, поэтому «удалил → создал заново» новый триал
    // не даст.
    const used = await this.trialLedger.findOne({
      where: { telegramId: user.telegramId },
    });
    if (used) {
      this.logger.log(`Триал для tg=${user.telegramId} уже выдавался — пропуск`);
      return null;
    }
    const plan = await this.getPlanByCode(PlanCode.TRIAL);
    if (!plan) {
      this.logger.warn(`Пробный тариф (trial) не найден — триал для ${userId} не выдан`);
      return null;
    }
    const now = new Date();
    const sub = this.subs.create({
      userId,
      planId: plan.id,
      plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: this.addDays(now, plan.durationDays),
      autoRenew: false,
      cancelAtPeriodEnd: false,
      failedRenewals: 0,
    });
    const saved = await this.subs.save(sub);
    await this.trialLedger.save(
      this.trialLedger.create({ telegramId: user.telegramId }),
    );
    this.logger.log(
      `Пользователю ${userId} (tg=${user.telegramId}) выдан пробный период до ` +
        `${saved.currentPeriodEnd!.toISOString()}`,
    );
    return saved;
  }

  /**
   * Создаёт (или переиспользует) pending-подписку для покупки.
   * Активируется только после успешного первого платежа.
   */
  async createPending(userId: string, planCode: PlanCode): Promise<Subscription> {
    const active = await this.getActive(userId);
    // Поверх пробного периода покупка разрешена (платный период стартует с конца
    // триала). Поверх обычной активной подписки — только смена тарифа.
    if (active && active.plan?.code !== PlanCode.TRIAL) {
      throw new BadRequestException(
        'У вас уже есть активная подписка. Используйте смену тарифа.',
      );
    }
    const plan = await this.getPlanByCode(planCode);
    if (!plan || !plan.isActive) throw new NotFoundException('Тариф не найден');

    // Переиспользуем уже существующий pending на тот же тариф.
    const existing = await this.subs.findOne({
      where: { userId, status: SubscriptionStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    if (existing) {
      existing.planId = plan.id;
      existing.plan = plan;
      return this.subs.save(existing);
    }
    const sub = this.subs.create({
      userId,
      planId: plan.id,
      plan,
      status: SubscriptionStatus.PENDING,
      autoRenew: true,
    });
    return this.subs.save(sub);
  }

  /** Активация после первого успешного платежа. */
  async activateInitial(subscriptionId: string): Promise<Subscription> {
    const sub = await this.getById(subscriptionId);
    if (!sub) throw new NotFoundException('Подписка не найдена');
    const now = new Date();
    // Если ещё идёт пробный период — платный период стартует с его конца
    // (пробные дни не сгорают), иначе с момента оплаты. Следующее списание
    // придётся на currentPeriodEnd = старт + длительность тарифа.
    const trial = await this.getActiveTrial(sub.userId);
    const start =
      trial?.currentPeriodEnd && trial.currentPeriodEnd.getTime() > now.getTime()
        ? trial.currentPeriodEnd
        : now;
    sub.status = SubscriptionStatus.ACTIVE;
    sub.currentPeriodStart = start;
    sub.currentPeriodEnd = this.addDays(start, sub.plan.durationDays);
    sub.autoRenew = true;
    sub.cancelAtPeriodEnd = false;
    sub.failedRenewals = 0;
    this.logger.log(
      `Подписка ${sub.id} активирована: ${start.toISOString()} → ${sub.currentPeriodEnd.toISOString()}`,
    );
    return this.subs.save(sub);
  }

  /**
   * Продление после успешного рекуррентного платежа.
   * Применяет смену тарифа (nextPlan), если она запланирована.
   */
  async renewAfterPayment(subscriptionId: string): Promise<Subscription> {
    const sub = await this.getById(subscriptionId);
    if (!sub) throw new NotFoundException('Подписка не найдена');

    if (sub.nextPlanId && sub.nextPlan) {
      this.logger.log(`Подписка ${sub.id}: смена тарифа на ${sub.nextPlan.code}`);
      sub.planId = sub.nextPlanId;
      sub.plan = sub.nextPlan;
      sub.nextPlanId = null;
      sub.nextPlan = null;
    }

    const base =
      sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()
        ? sub.currentPeriodEnd
        : new Date();
    sub.currentPeriodStart = new Date();
    sub.currentPeriodEnd = this.addDays(base, sub.plan.durationDays);
    sub.status = SubscriptionStatus.ACTIVE;
    sub.failedRenewals = 0;
    return this.subs.save(sub);
  }

  /** Отмена в конце периода: доступ сохраняется до currentPeriodEnd. */
  async cancelAtPeriodEnd(userId: string): Promise<Subscription> {
    const sub = await this.getActive(userId);
    if (!sub) throw new NotFoundException('Активная подписка не найдена');
    sub.cancelAtPeriodEnd = true;
    sub.autoRenew = false;
    sub.status = SubscriptionStatus.CANCELED;
    sub.canceledAt = new Date();
    sub.nextPlanId = null;
    sub.nextPlan = null;
    this.logger.log(`Подписка ${sub.id} отменена, доступ до ${sub.currentPeriodEnd?.toISOString()}`);
    return this.subs.save(sub);
  }

  /** Возобновление отменённой подписки (пока период ещё не истёк). */
  async resume(userId: string): Promise<Subscription> {
    const sub = await this.getActive(userId);
    if (!sub) throw new NotFoundException('Активная подписка не найдена');
    if (sub.status !== SubscriptionStatus.CANCELED) {
      throw new BadRequestException('Подписка не отменена');
    }
    sub.cancelAtPeriodEnd = false;
    sub.autoRenew = true;
    sub.status = SubscriptionStatus.ACTIVE;
    sub.canceledAt = null;
    return this.subs.save(sub);
  }

  /** Смена тарифа со следующего периода. */
  async changePlan(userId: string, planCode: PlanCode): Promise<Subscription> {
    const sub = await this.getActive(userId);
    if (!sub) throw new NotFoundException('Активная подписка не найдена');
    const plan = await this.getPlanByCode(planCode);
    if (!plan || !plan.isActive) throw new NotFoundException('Тариф не найден');

    if (plan.id === sub.planId) {
      // Возврат к текущему тарифу — отменяем запланированную смену.
      sub.nextPlanId = null;
      sub.nextPlan = null;
    } else {
      sub.nextPlanId = plan.id;
      sub.nextPlan = plan;
    }
    // Смена тарифа подразумевает продолжение подписки.
    if (sub.status === SubscriptionStatus.CANCELED) {
      sub.status = SubscriptionStatus.ACTIVE;
      sub.cancelAtPeriodEnd = false;
      sub.autoRenew = true;
      sub.canceledAt = null;
    }
    this.logger.log(`Подписка ${sub.id}: запланирована смена на ${plan.code} со следующего периода`);
    return this.subs.save(sub);
  }

  // ── админские операции (без оплаты) ──

  /** Ручная выдача/обновление подписки админом (без платежа, без автопродления). */
  async adminGrant(userId: string, planCode: PlanCode, days?: number): Promise<Subscription> {
    const plan = await this.getPlanByCode(planCode);
    if (!plan) throw new NotFoundException('Тариф не найден');
    const now = new Date();
    let sub = await this.getLatest(userId);
    if (!sub) sub = this.subs.create({ userId });
    sub.planId = plan.id;
    sub.plan = plan;
    sub.nextPlanId = null;
    sub.nextPlan = null;
    sub.status = SubscriptionStatus.ACTIVE;
    sub.currentPeriodStart = now;
    sub.currentPeriodEnd = this.addDays(now, days && days > 0 ? days : plan.durationDays);
    sub.cancelAtPeriodEnd = false;
    sub.canceledAt = null;
    sub.autoRenew = false; // ручная выдача без сохранённой карты
    sub.failedRenewals = 0;
    this.logger.log(`Админ: подписка ${sub.id} выдана (${plan.code}) до ${sub.currentPeriodEnd.toISOString()}`);
    return this.subs.save(sub);
  }

  /** Продление периода админом на N дней. */
  async adminExtend(userId: string, days: number): Promise<Subscription> {
    const sub = await this.getLatest(userId);
    if (!sub) throw new NotFoundException('Подписка не найдена');
    const base =
      sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()
        ? sub.currentPeriodEnd
        : new Date();
    sub.currentPeriodEnd = this.addDays(base, days);
    if (sub.status === SubscriptionStatus.EXPIRED || sub.status === SubscriptionStatus.PENDING) {
      sub.status = SubscriptionStatus.ACTIVE;
      sub.currentPeriodStart = sub.currentPeriodStart ?? new Date();
    }
    return this.subs.save(sub);
  }

  /** Немедленная смена тарифа админом (с текущего момента). */
  async adminChangePlanNow(userId: string, planCode: PlanCode): Promise<Subscription> {
    const sub = await this.getLatest(userId);
    if (!sub) throw new NotFoundException('Подписка не найдена');
    const plan = await this.getPlanByCode(planCode);
    if (!plan) throw new NotFoundException('Тариф не найден');
    sub.planId = plan.id;
    sub.plan = plan;
    sub.nextPlanId = null;
    sub.nextPlan = null;
    return this.subs.save(sub);
  }

  async markPastDue(subscriptionId: string): Promise<void> {
    const sub = await this.getById(subscriptionId);
    if (!sub) return;
    sub.status = SubscriptionStatus.PAST_DUE;
    sub.failedRenewals += 1;
    await this.subs.save(sub);
  }

  async expire(subscriptionId: string): Promise<void> {
    await this.subs.update(subscriptionId, { status: SubscriptionStatus.EXPIRED });
  }

  /** Подписки, которым пора продлеваться (автосписание). */
  findDueForRenewal(now = new Date()): Promise<Subscription[]> {
    return this.subs.find({
      where: {
        autoRenew: true,
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]),
        currentPeriodEnd: LessThanOrEqual(now),
      },
    });
  }

  /**
   * Подписки, у которых период закончился и продлевать не нужно:
   *  - отменённые/просроченные (canceled/past_due);
   *  - активные без автопродления (триал, ручная выдача админом).
   */
  findToExpire(now = new Date()): Promise<Subscription[]> {
    return this.subs.find({
      where: [
        {
          status: In([SubscriptionStatus.CANCELED, SubscriptionStatus.PAST_DUE]),
          currentPeriodEnd: LessThanOrEqual(now),
        },
        {
          status: SubscriptionStatus.ACTIVE,
          autoRenew: false,
          currentPeriodEnd: LessThanOrEqual(now),
        },
      ],
    });
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}
