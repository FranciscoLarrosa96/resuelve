import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  app.enableShutdownHooks();

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  // 0.0.0.0: necesario en Render/containers para aceptar tráfico externo.
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`Resuelve API escuchando en :${port} (docs en /api/docs)`, 'Bootstrap');
}

void bootstrap();
