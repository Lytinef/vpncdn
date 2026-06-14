import { User } from '../modules/users/entities/user.entity';
import { Session } from '../modules/auth/entities/session.entity';
import { Plan } from '../modules/subscriptions/entities/plan.entity';
import { Subscription } from '../modules/subscriptions/entities/subscription.entity';
import { Payment } from '../modules/payments/entities/payment.entity';
import { PaymentMethod } from '../modules/payments/entities/payment-method.entity';
import { Device } from '../modules/devices/entities/device.entity';
import { Node } from '../modules/nodes/entities/node.entity';
import { BypassEntry } from '../modules/bypass/entities/bypass-entry.entity';
import { AdminUser } from '../modules/admin/entities/admin-user.entity';

/** Единый список сущностей для TypeORM (forRoot и CLI data-source). */
export const entities = [
  User,
  Session,
  Plan,
  Subscription,
  Payment,
  PaymentMethod,
  Device,
  Node,
  BypassEntry,
  AdminUser,
];
