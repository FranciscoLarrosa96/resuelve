import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/**
 * Configuración compartida por main.ts y los tests e2e, para que los tests
 * ejerciten exactamente la misma app (prefijo, validación, errores, seguridad).
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  // Detrás del proxy de Render: IP real para rate limiting y logs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const strictHelmet = helmet();
  // Swagger UI necesita scripts/estilos inline: CSP relajada solo en /api/docs.
  const docsHelmet = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(`/${DOCS_PATH}`) ? docsHelmet(req, res, next) : strictHelmet(req, res, next),
  );

  const origins = config
    .getOrThrow<string>('FRONTEND_URL')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false, // los tokens viajan en el header Authorization, no en cookies
    maxAge: 600,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const doc = new DocumentBuilder()
    .setTitle('Resuelve API')
    .setDescription(
      'API REST de Resuelve: catálogo, profesionales, solicitudes, presupuestos, turnos y reseñas.\n\n' +
        'Autenticación: `Authorization: Bearer <accessToken>` (obtenido en /auth/login). ' +
        'Errores: `{ statusCode, code, message, details?, path, timestamp }`. ' +
        'Montos: strings con dos decimales ("52000.00").',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(DOCS_PATH, app, () => SwaggerModule.createDocument(app, doc), {
    jsonDocumentUrl: `${DOCS_PATH}/openapi.json`,
    swaggerOptions: { persistAuthorization: true },
  });
}
