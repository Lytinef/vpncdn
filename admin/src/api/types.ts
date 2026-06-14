export interface PlanView {
  code: string;
  name: string;
  priceRub: number;
  deviceLimit: number;
  durationDays: number;
}

export interface SubscriptionView {
  id: string;
  status: string;
  plan: PlanView;
  nextPlan: PlanView | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
}

export interface DashboardStats {
  usersTotal: number;
  activeSubscriptions: number;
  activeDevices: number;
  revenueThisMonthRub: number;
}

export interface UserListItem {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  isBlocked: boolean;
  createdAt: string;
  subscription: SubscriptionView | null;
}

export interface Paginated<T> {
  total: number;
  page: number;
  limit: number;
  items: T[];
}

export interface PaymentListItem {
  id: string;
  userId: string;
  amountRub: number;
  status: string;
  purpose: string;
  isRecurring: boolean;
  createdAt: string;
}

export interface NodeView {
  id: string;
  name: string;
  region: string | null;
  cdnDomain: string;
  originHost: string;
  sni: string;
  port: number;
  wsPath: string;
  capacity: number;
  isActive: boolean;
  hasApi: boolean;
  devices: number;
}

export interface BypassEntryView {
  id: string;
  type: 'app' | 'domain';
  value: string;
  title: string;
  category: string | null;
  isActive: boolean;
}
