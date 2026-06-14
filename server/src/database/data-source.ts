import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { entities } from './entities';

loadEnv();

/**
 * DataSource для CLI TypeORM (migration:generate/run/revert).
 * Приложение использует отдельную конфигурацию в app.module через forRootAsync.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'vpn',
  password: process.env.DB_PASSWORD ?? 'vpn',
  database: process.env.DB_NAME ?? 'vpn',
  entities,
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
