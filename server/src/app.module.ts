import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configuration, {
  DatabaseConfig,
  RedisConfig,
} from './config/configuration';
import { entities } from './database/entities';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { DevicesModule } from './modules/devices/devices.module';
import { BypassModule } from './modules/bypass/bypass.module';
import { AccountModule } from './modules/account/account.module';
import { AdminModule } from './modules/admin/admin.module';
import { StatsModule } from './modules/stats/stats.module';
import { BotModule } from './modules/bot/bot.module';
import { AppVersionModule } from './modules/app-version/app-version.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get<DatabaseConfig>('database')!;
        return {
          type: 'postgres',
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
          entities,
          migrations: ['dist/database/migrations/*.js'],
          synchronize: false,
          // Авто-применение миграций при старте (удобно для деплоя single-instance).
          // Можно отключить через RUN_MIGRATIONS=false.
          migrationsRun: process.env.RUN_MIGRATIONS !== 'false',
        };
      },
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.get<RedisConfig>('redis')!;
        return { connection: { host: redis.host, port: redis.port } };
      },
    }),

    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    AuthModule,
    UsersModule,
    SubscriptionsModule,
    PaymentsModule,
    NodesModule,
    DevicesModule,
    BypassModule,
    AccountModule,
    AdminModule,
    StatsModule,
    BotModule,
    AppVersionModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
