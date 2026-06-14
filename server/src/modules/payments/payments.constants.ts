/** Имя очереди BullMQ для рекуррентных продлений. */
export const RENEWAL_QUEUE = 'subscription-renewal';

export interface RenewalJobData {
  subscriptionId: string;
}
