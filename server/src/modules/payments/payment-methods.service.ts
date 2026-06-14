import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity';
import { YkPaymentMethod } from './yookassa.client';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly repo: Repository<PaymentMethod>,
  ) {}

  list(userId: string): Promise<PaymentMethod[]> {
    return this.repo.find({ where: { userId, isActive: true }, order: { createdAt: 'DESC' } });
  }

  getDefault(userId: string): Promise<PaymentMethod | null> {
    return this.repo.findOne({
      where: { userId, isActive: true, isDefault: true },
    });
  }

  /** Сохраняет способ оплаты из ответа YooKassa (если saved=true). */
  async saveFromYookassa(userId: string, ykMethod: YkPaymentMethod): Promise<PaymentMethod | null> {
    if (!ykMethod?.saved || !ykMethod.id) return null;

    const existing = await this.repo.findOne({
      where: { yookassaPaymentMethodId: ykMethod.id },
    });
    if (existing) return existing;

    // Новый способ делаем дефолтным, старые — снимаем с дефолта.
    await this.repo.update({ userId, isDefault: true }, { isDefault: false });
    const method = this.repo.create({
      userId,
      yookassaPaymentMethodId: ykMethod.id,
      title: ykMethod.title ?? null,
      cardLast4: ykMethod.card?.last4 ?? null,
      cardType: ykMethod.card?.card_type ?? null,
      isDefault: true,
      isActive: true,
    });
    return this.repo.save(method);
  }

  async remove(userId: string, id: string): Promise<void> {
    const method = await this.repo.findOne({ where: { id, userId } });
    if (!method) throw new NotFoundException('Способ оплаты не найден');
    method.isActive = false;
    method.isDefault = false;
    await this.repo.save(method);
  }
}
