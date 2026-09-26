import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { confirmWord, isRemoteDatabase, parseArgs } from '../common/cli';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { CloudinaryDocumentStorage, DOCUMENT_STORAGE } from './document-storage';
import {
  ReviewItem,
  REVIEW_LINK_TTL_SECONDS,
  VerificationReviewService,
} from './verification-review.service';

/**
 * Moderación de verificaciones desde la terminal. Es el respaldo del panel
 * /admin/matriculas y usa exactamente el mismo servicio.
 *
 *   npm run verification:review -- list
 *   npm run verification:review -- show <id>
 *   npm run verification:review -- approve <id> [--expires 2027-12-31] [--reviewer nombre] [--purge-document]
 *   npm run verification:review -- reject <id> --reason "La imagen no permite leer el número." [--reviewer nombre] [--purge-document]
 *   npm run verification:review -- purge <id>
 *
 * Usa DATABASE_URL (y CLOUDINARY_* para ver o borrar documentos). Nunca
 * imprime la URL de la base ni secretos. Contra una base que no es local pide
 * escribir la acción (APPROVE / REJECT / PURGE) antes de modificar nada.
 */

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildDataSourceOptions({
          DATABASE_URL: config.getOrThrow('DATABASE_URL'),
          DATABASE_SSL: config.get('DATABASE_SSL'),
        }),
        logging: false,
      }),
    }),
  ],
  providers: [
    VerificationReviewService,
    {
      provide: DOCUMENT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new CloudinaryDocumentStorage({
          cloudName: config.get('CLOUDINARY_CLOUD_NAME'),
          apiKey: config.get('CLOUDINARY_API_KEY'),
          apiSecret: config.get('CLOUDINARY_API_SECRET'),
          apiBase: config.get('CLOUDINARY_API_BASE'),
        }),
    },
  ],
})
class ReviewCliModule {}

function print(item: ReviewItem): void {
  const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');
  console.log(
    [
      `${item.id}  [${item.status}]`,
      `  Profesional: ${item.professional} (${item.professionalId})`,
      `  Tipo: ${item.type}${item.service ? ` · ${item.service}` : ''}`,
      `  Referencia: ${item.reference ?? '—'}`,
      `  Enviada: ${date(item.submittedAt)} · Vence: ${date(item.expiresAt)} · Revisada: ${date(item.reviewedAt)}`,
      `  Documento: ${item.document ? `${item.document.format ?? '?'} · ${Math.round((item.document.bytes ?? 0) / 1024)} KB` : 'sin documento'}`,
      ...(item.rejectionReason ? [`  Motivo: ${item.rejectionReason}`] : []),
    ].join('\n'),
  );
}

const HELP = `Uso:
  npm run verification:review -- list
  npm run verification:review -- show <id>
  npm run verification:review -- approve <id> [--expires AAAA-MM-DD] [--reviewer nombre] [--purge-document]
  npm run verification:review -- reject <id> --reason "motivo legible" [--reviewer nombre] [--purge-document]
  npm run verification:review -- purge <id>`;

async function main(): Promise<number> {
  const { command, id, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help' || !['list', 'show', 'approve', 'reject', 'purge'].includes(command)) {
    console.log(HELP);
    return command === 'help' ? 0 : 1;
  }
  if (command !== 'list' && !id) {
    console.error('Falta el id de la verificación.\n' + HELP);
    return 1;
  }

  const app = await NestFactory.createApplicationContext(ReviewCliModule, { logger: ['error'] });
  try {
    const review = app.get(VerificationReviewService);
    const reviewer = typeof flags.reviewer === 'string' ? flags.reviewer : process.env.USER || 'operador';
    const writes = ['approve', 'reject', 'purge'].includes(command);
    if (writes && isRemoteDatabase(process.env.DATABASE_URL)) {
      const word = command === 'approve' ? 'APPROVE' : command === 'reject' ? 'REJECT' : 'PURGE';
      if (!(await confirmWord(word))) {
        console.log('Cancelado: no se modificó nada.');
        return 1;
      }
    }

    switch (command) {
      case 'list': {
        const items = await review.listPending();
        if (!items.length) console.log('No hay verificaciones pendientes.');
        items.forEach(print);
        break;
      }
      case 'show': {
        const { item, documentUrl, history } = await review.show(id!);
        print(item);
        for (const h of history)
          console.log(
            `  Envío anterior: ${h.submittedAt.toISOString().slice(0, 10)} [${h.status}] ${h.reference ?? '—'}` +
              (h.rejectionReason ? ` · Motivo: ${h.rejectionReason}` : ''),
          );
        if (item.type === 'LICENSE')
          console.log(
            '  Cómo verificar: buscá la referencia en el registro oficial del servicio y confirmá que esté vigente\n' +
              '  y a nombre de este profesional. El documento, si hay, es solo un respaldo.',
          );
        // Link firmado y temporal SOLO para quien revisa; no se guarda ni se loguea.
        if (documentUrl)
          console.log(`  Ver documento (vence en ${REVIEW_LINK_TTL_SECONDS / 60} min): ${documentUrl}`);
        break;
      }
      case 'approve': {
        const expires =
          typeof flags.expires === 'string' ? new Date(`${flags.expires}T23:59:59-03:00`) : undefined;
        if (expires && Number.isNaN(expires.getTime())) throw new Error('--expires debe ser AAAA-MM-DD');
        print(await review.approve(id!, reviewer, expires ? { expiresAt: expires } : {}));
        if (flags['purge-document']) print(await review.purgeDocument(id!));
        break;
      }
      case 'reject': {
        if (typeof flags.reason !== 'string')
          throw new Error('Falta --reason "motivo" (lo ve el profesional)');
        print(await review.reject(id!, reviewer, flags.reason));
        if (flags['purge-document']) print(await review.purgeDocument(id!));
        break;
      }
      case 'purge':
        print(await review.purgeDocument(id!));
        break;
    }
    return 0;
  } catch (error) {
    // Solo el mensaje: sin stack con configuración ni URLs.
    console.error(`Error: ${(error as Error).message}`);
    return 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().then((code) => process.exit(code));
}
