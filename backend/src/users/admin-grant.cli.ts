import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { confirmWord, isRemoteDatabase, parseArgs } from '../common/cli';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { User } from './user.entity';

/**
 * Otorga o quita el acceso al panel de administración. No existe endpoint
 * para esto: solo se hace desde la terminal, con acceso a la base.
 *
 *   npm run admin:grant -- vos@ejemplo.com
 *   npm run admin:grant -- vos@ejemplo.com --revoke
 *   npm run admin:grant -- list
 *
 * Usa DATABASE_URL. Contra una base remota pide escribir GRANT / REVOKE.
 * Nunca imprime la URL de la base.
 */

const HELP = `Uso:
  npm run admin:grant -- <email>            da acceso al panel
  npm run admin:grant -- <email> --revoke   lo quita
  npm run admin:grant -- list               muestra quiénes tienen acceso`;

async function main(): Promise<number> {
  config({ quiet: true });
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help' || command.startsWith('--')) {
    console.log(HELP);
    return command === 'help' ? 0 : 1;
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL.');
    return 1;
  }

  const ds = new DataSource({
    ...buildDataSourceOptions({
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_SSL: process.env.DATABASE_SSL,
    }),
    logging: false,
  });
  try {
    await ds.initialize();
  } catch (error) {
    // Sin la URL ni el stack: solo el motivo.
    console.error(`No se pudo conectar a la base: ${(error as Error).message}`);
    return 1;
  }
  try {
    const users = ds.getRepository(User);
    if (command === 'list') {
      const admins = await users.find({ where: { isAdmin: true }, order: { createdAt: 'ASC' } });
      if (!admins.length) console.log('Nadie tiene acceso al panel.');
      for (const a of admins) console.log(`${a.email}  (${a.firstName} ${a.lastName})`);
      return 0;
    }

    const email = command.trim().toLowerCase();
    const user = await users.createQueryBuilder('u').where('lower(u.email) = :email', { email }).getOne();
    if (!user) {
      console.error('No existe una cuenta con ese email. Primero registrate en la app.');
      return 1;
    }
    const grant = !flags.revoke;
    if (user.isAdmin === grant) {
      console.log(
        grant ? `${user.email} ya tiene acceso al panel.` : `${user.email} no tenía acceso al panel.`,
      );
      return 0;
    }
    if (isRemoteDatabase(process.env.DATABASE_URL) && !(await confirmWord(grant ? 'GRANT' : 'REVOKE'))) {
      console.log('Cancelado: no se modificó nada.');
      return 1;
    }
    await users.update(user.id, { isAdmin: grant });
    console.log(
      grant
        ? `Listo: ${user.email} tiene acceso al panel. Cerrá sesión y volvé a entrar para verlo.`
        : `Listo: ${user.email} ya no tiene acceso al panel.`,
    );
    return 0;
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    return 1;
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  void main().then((code) => process.exit(code));
}
