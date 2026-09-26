import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { HealthModule } from './health/health.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { QuotesModule } from './quotes/quotes.module';
import { RequestsModule } from './requests/requests.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UsersModule } from './users/users.module';
import { VerificationsModule } from './verifications/verifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', 'info'),
          // Nunca loguear credenciales ni tokens.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.refreshToken',
            ],
            censor: '[redacted]',
          },
          autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
          customProps: () => ({ service: 'resuelve-api' }),
          // Logs compactos: sin headers ni bodies (evita filtrar datos personales).
          serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildDataSourceOptions({
          DATABASE_URL: config.getOrThrow('DATABASE_URL'),
          DATABASE_SSL: config.get('DATABASE_SSL'),
        }),
        autoLoadEntities: false,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'default', ttl: 60_000, limit: config.get<number>('THROTTLE_LIMIT', 120) },
      ],
    }),
    JwtModule.register({ global: true }),
    HealthModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    ProfessionalsModule,
    RequestsModule,
    QuotesModule,
    AppointmentsModule,
    ReviewsModule,
    VerificationsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
