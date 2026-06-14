import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Device } from '../devices/entities/device.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/entities/subscription.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { UsersService } from '../users/users.service';
import { AccountService } from '../account/account.service';
import { kopecksToRubles } from '../../common/money';
import { serializeSubscription } from '../subscriptions/subscriptions.serializer';

const ACCESS_STATUSES = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.CANCELED,
];

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly usersService: UsersService,
    private readonly account: AccountService,
  ) {}

  async dashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const usersTotal = await this.users.count();
    const activeSubscriptions = await this.subs
      .createQueryBuilder('s')
      .where('s.status IN (:...st)', { st: ACCESS_STATUSES })
      .andWhere('s.currentPeriodEnd > :now', { now })
      .getCount();
    const activeDevices = await this.devices.count({ where: { isActive: true } });

    const revenueRow = await this.payments
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amountKopecks),0)', 'sum')
      .where('p.status = :s', { s: PaymentStatus.SUCCEEDED })
      .andWhere('p.createdAt >= :from', { from: startOfMonth })
      .getRawOne<{ sum: string }>();

    return {
      usersTotal,
      activeSubscriptions,
      activeDevices,
      revenueThisMonthRub: kopecksToRubles(Number(revenueRow?.sum ?? 0)),
    };
  }

  async listUsers(params: { search?: string; page: number; limit: number }) {
    const { search, page, limit } = params;
    const qb = this.users.createQueryBuilder('u').orderBy('u.createdAt', 'DESC');
    if (search) {
      qb.where(
        new Brackets((w) => {
          w.where('u.username ILIKE :s', { s: `%${search}%` })
            .orWhere('u.firstName ILIKE :s', { s: `%${search}%` })
            .orWhere('CAST(u.telegramId AS TEXT) ILIKE :s', { s: `%${search}%` });
        }),
      );
    }
    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Активные подписки одним запросом.
    const ids = items.map((u) => u.id);
    const subsByUser = new Map<string, Subscription>();
    if (ids.length) {
      const activeSubs = await this.subs.find({
        where: { userId: In(ids), status: In(ACCESS_STATUSES) },
        order: { currentPeriodEnd: 'DESC' },
      });
      for (const s of activeSubs) {
        if (!subsByUser.has(s.userId)) subsByUser.set(s.userId, s);
      }
    }

    return {
      total,
      page,
      limit,
      items: items.map((u) => ({
        id: u.id,
        telegramId: u.telegramId,
        username: u.username,
        firstName: u.firstName,
        isBlocked: u.isBlocked,
        createdAt: u.createdAt,
        subscription: serializeSubscription(subsByUser.get(u.id) ?? null),
      })),
    };
  }

  async getUser(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    const subscriptions = await this.subs.find({
      where: { userId: id },
      order: { createdAt: 'DESC' },
    });
    const devices = await this.devices.find({ where: { userId: id } });
    const payments = await this.payments.find({
      where: { userId: id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return {
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        isBlocked: user.isBlocked,
        createdAt: user.createdAt,
      },
      subscriptions: subscriptions.map(serializeSubscription),
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        isActive: d.isActive,
        lastSeenAt: d.lastSeenAt,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amountRub: kopecksToRubles(p.amountKopecks),
        status: p.status,
        purpose: p.purpose,
        createdAt: p.createdAt,
      })),
    };
  }

  setBlocked(id: string, blocked: boolean) {
    return this.usersService.setBlocked(id, blocked);
  }

  deleteUser(id: string) {
    return this.account.deleteAccount(id);
  }

  async listPayments(params: { page: number; limit: number; status?: PaymentStatus }) {
    const { page, limit, status } = params;
    const where = status ? { status } : {};
    const [items, total] = await this.payments.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      total,
      page,
      limit,
      items: items.map((p) => ({
        id: p.id,
        userId: p.userId,
        amountRub: kopecksToRubles(p.amountKopecks),
        status: p.status,
        purpose: p.purpose,
        isRecurring: p.isRecurring,
        createdAt: p.createdAt,
      })),
    };
  }
}
