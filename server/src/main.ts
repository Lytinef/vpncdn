import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AppConfig, AdminConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const appConfig = config.get<AppConfig>('app')!;
  const adminConfig = config.get<AdminConfig>('admin')!;

  // YooKassa webhook нуждается в сыром теле — но JSON по умолчанию ок,
  // подпись проверяем по IP + Basic. Ограничиваем размер тела.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Админка должна открываться с любого устройства/IP, но CORS-источник
  // фиксируем через переменную окружения (можно '*' при необходимости).
  app.enableCors({
    origin: adminConfig.origin === '*' ? true : adminConfig.origin.split(','),
    credentials: true,
  });

  if (appConfig.env !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Unway API')
      .setDescription('API биллинга, подписок и управления VPN')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(appConfig.port, '0.0.0.0');
  Logger.log(`API запущен на порту ${appConfig.port}`, 'Bootstrap');
}

bootstrap();
