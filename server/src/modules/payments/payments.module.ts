import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Payment } from './entities/payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymentsService } from './payments.service';
import { PaymentMethodsService } from './payment-methods.service';
import { YookassaClient } from './yookassa.client';
import { PaymentsController } from './payments.controller';
import { RenewalScheduler } from './renewal.scheduler';
import { RenewalProcessor } from './renewal.processor';
import { RENEWAL_QUEUE } from './payments.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentMethod]),
    BullModule.registerQueue({ name: RENEWAL_QUEUE }),
    SubscriptionsModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentMethodsService,
    YookassaClient,
    RenewalScheduler,
    RenewalProcessor,
  ],
  exports: [PaymentsService, PaymentMethodsService],
})
export class PaymentsModule {}
