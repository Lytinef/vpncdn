import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PaymentsService } from './payments.service';
import { RENEWAL_QUEUE, RenewalJobData } from './payments.constants';

@Processor(RENEWAL_QUEUE)
export class RenewalProcessor extends WorkerHost {
  private readonly logger = new Logger(RenewalProcessor.name);

  constructor(private readonly payments: PaymentsService) {
    super();
  }

  async process(job: Job<RenewalJobData>): Promise<void> {
    this.logger.log(`Продление подписки ${job.data.subscriptionId} (попытка ${job.attemptsMade + 1})`);
    await this.payments.chargeRenewal(job.data.subscriptionId);
  }
}
