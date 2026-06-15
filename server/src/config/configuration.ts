export interface AppConfig {
  env: string;
  port: number;
  publicApiUrl: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
}

export interface RedisConfig {
  host: string;
  port: number;
}

export interface JwtConfig {
  accessSecret: string;
  accessTtl: number;
  refreshSecret: string;
  refreshTtl: number;
}

export interface TelegramConfig {
  botToken: string;
  botUsername: string;
  authTtl: number;
}

export interface YookassaConfig {
  shopId: string;
  secretKey: string;
  webhookPath: string;
  returnUrl: string;
}

export interface AdminConfig {
  jwtSecret: string;
  jwtTtl: number;
  bootstrapEmail: string;
  bootstrapPassword: string;
  origin: string;
}

export interface XrayConfig {
  apiSecret: string;
}

export interface AlertsConfig {
  /** Telegram chat_id, куда слать алёрты нагрузки (пусто — выключено). */
  telegramChatId: string;
  cpuPercent: number;
  memPercent: number;
}

export interface Configuration {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  telegram: TelegramConfig;
  yookassa: YookassaConfig;
  admin: AdminConfig;
  xray: XrayConfig;
  alerts: AlertsConfig;
}

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default (): Configuration => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    port: num(process.env.PORT, 3000),
    publicApiUrl: process.env.PUBLIC_API_URL ?? 'http://localhost:3000',
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: num(process.env.DB_PORT, 5432),
    user: process.env.DB_USER ?? 'vpn',
    password: process.env.DB_PASSWORD ?? 'vpn',
    name: process.env.DB_NAME ?? 'vpn',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: num(process.env.REDIS_PORT, 6379),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access',
    accessTtl: num(process.env.JWT_ACCESS_TTL, 900),
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh',
    refreshTtl: num(process.env.JWT_REFRESH_TTL, 2592000),
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
    authTtl: num(process.env.TELEGRAM_AUTH_TTL, 86400),
  },
  yookassa: {
    shopId: process.env.YOOKASSA_SHOP_ID ?? '',
    secretKey: process.env.YOOKASSA_SECRET_KEY ?? '',
    webhookPath: process.env.YOOKASSA_WEBHOOK_PATH ?? '/payments/yookassa/webhook',
    returnUrl: process.env.YOOKASSA_RETURN_URL ?? 'vpncdn://payment/result',
  },
  admin: {
    jwtSecret: process.env.ADMIN_JWT_SECRET ?? 'dev_admin',
    jwtTtl: num(process.env.ADMIN_JWT_TTL, 43200),
    bootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@example.com',
    bootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'admin',
    origin: process.env.ADMIN_ORIGIN ?? 'http://localhost:8080',
  },
  xray: {
    apiSecret: process.env.XRAY_API_SECRET ?? 'dev_xray',
  },
  alerts: {
    telegramChatId: process.env.ALERT_TELEGRAM_CHAT_ID ?? '',
    cpuPercent: num(process.env.ALERT_CPU_PERCENT, 85),
    memPercent: num(process.env.ALERT_MEM_PERCENT, 90),
  },
});
