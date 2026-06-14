import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RENEWAL_QUEUE, RenewalJobData } from './payments.constants';

/**
 * Раз в час:
 *  1) ставит в очередь автопродление подписок, у которых закончился период;
 *  2) переводит в expired отменённые/просроченные подписки после конца периода.
 */
@Injectable()
export class RenewalScheduler {
  private readonly logger = new Logger(RenewalScheduler.name);

  constructor(
    @InjectQueue(RENEWAL_QUEUE) private readonly queue: Queue<RenewalJobData>,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async tick() {
    const now = new Date();

    const due = await this.subscriptions.findDueForRenewal(now);
    for (const sub of due) {
      await this.queue.add(
        'renew',
        { subscriptionId: sub.id },
        {
          jobId: `renew:${sub.id}:${sub.currentPeriodEnd?.getTime()}`,
          attempts: 4,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
    if (due.length) this.logger.log(`В очередь продления добавлено: ${due.length}`);

    const toExpire = await this.subscriptions.findToExpire(now);
    for (const sub of toExpire) {
      await this.subscriptions.expire(sub.id);
    }
    if (toExpire.length) this.logger.log(`Переведено в expired: ${toExpire.length}`);
  }
}
