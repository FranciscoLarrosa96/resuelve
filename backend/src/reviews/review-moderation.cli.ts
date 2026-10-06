import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { confirmWord, isRemoteDatabase, parseArgs } from '../common/cli';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { ReportItem, ReviewModerationService } from './review-moderation.service';

/**
 * Moderación de reseñas reportadas desde la terminal.
 *
 *   npm run reviews:moderation -- list
 *   npm run reviews:moderation -- show <reportId>
 *   npm run reviews:moderation -- hide <reportId> --reason "motivo" [--reviewer nombre]
 *   npm run reviews:moderation -- dismiss <reportId> [--reviewer nombre]
 *   npm run reviews:moderation -- restore <reviewId>
 *
 * Usa DATABASE_URL y nunca imprime la URL ni secretos. Contra una base que no es local pide escribir la
 * acción (HIDE / DISMISS / RESTORE) antes de modificar nada.
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
  providers: [ReviewModerationService],
})
class ModerationCliModule {}

function print(i: ReportItem): void {
  console.log(
    [
      `${i.reportId}  [${i.status}]${i.hidden ? '  (reseña oculta)' : ''}`,
      `  Reseña ${i.reviewId} · ${i.kind} · ${i.rating}★ de ${i.reviewer} sobre ${i.professional}`,
      `  Comentario: ${i.comment ? `“${i.comment}”` : '—'}`,
      `  Motivo del reporte: ${i.reason}${i.details ? ` · ${i.details}` : ''}`,
      `  Reportó: ${i.reporterEmail} · ${i.reportedAt.toISOString().slice(0, 10)}`,
    ].join('\n'),
  );
}

const HELP = `Uso:
  npm run reviews:moderation -- list
  npm run reviews:moderation -- show <reportId>
  npm run reviews:moderation -- hide <reportId> --reason "motivo" [--reviewer nombre]
  npm run reviews:moderation -- dismiss <reportId> [--reviewer nombre]
  npm run reviews:moderation -- restore <reviewId>`;

async function main(): Promise<number> {
  const { command, id, flags } = parseArgs(process.argv.slice(2));
  if (!['list', 'show', 'hide', 'dismiss', 'restore'].includes(command)) {
    console.log(HELP);
    return command === 'help' ? 0 : 1;
  }
  if (command !== 'list' && !id) {
    console.error('Falta el id.\n' + HELP);
    return 1;
  }
  const app = await NestFactory.createApplicationContext(ModerationCliModule, { logger: ['error'] });
  try {
    const moderation = app.get(ReviewModerationService);
    const reviewer = typeof flags.reviewer === 'string' ? flags.reviewer : process.env.USER || 'operador';
    if (['hide', 'dismiss', 'restore'].includes(command) && isRemoteDatabase(process.env.DATABASE_URL)) {
      if (!(await confirmWord(command.toUpperCase()))) {
        console.log('Cancelado: no se modificó nada.');
        return 1;
      }
    }
    switch (command) {
      case 'list': {
        const items = await moderation.listOpen();
        if (!items.length) console.log('No hay reportes abiertos.');
        items.forEach(print);
        break;
      }
      case 'show':
        print(await moderation.show(id!));
        break;
      case 'hide':
        if (typeof flags.reason !== 'string') throw new Error('Falta --reason "motivo"');
        print(await moderation.hide(id!, reviewer, flags.reason));
        break;
      case 'dismiss':
        print(await moderation.dismiss(id!, reviewer));
        break;
      case 'restore':
        await moderation.restore(id!);
        console.log('Reseña restaurada.');
        break;
    }
    return 0;
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    return 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().then((code) => process.exit(code));
}
