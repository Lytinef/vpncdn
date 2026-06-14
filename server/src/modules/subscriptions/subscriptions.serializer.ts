import { kopecksToRubles } from '../../common/money';
import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';

export const serializePlan = (plan: Plan) => ({
  code: plan.code,
  name: plan.name,
  priceRub: kopecksToRubles(plan.priceKopecks),
  deviceLimit: plan.deviceLimit,
  durationDays: plan.durationDays,
});

export const serializeSubscription = (sub: Subscription | null) => {
  if (!sub) return null;
  return {
    id: sub.id,
    status: sub.status,
    plan: serializePlan(sub.plan),
    nextPlan: sub.nextPlan ? serializePlan(sub.nextPlan) : null,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    autoRenew: sub.autoRenew,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
};
