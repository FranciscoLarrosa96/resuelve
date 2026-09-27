import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { confirmWord, isRemoteDatabase, parseArgs } from '../common/cli';

/**
 * Reconciliación manual de billing (Mercado Pago). Lee el estado ACTUAL del
 * proveedor y lo aplica, igual que el webhook y el job.
 *
 *   npm run billing:reconcile -- list pending       PENDING (checkouts sin autorizar)
 *   npm run billing:reconcile -- list past-due      cobros rechazados en reintento
 *   npm run billing:reconcile -- list price         promo cobrada sin pasar a precio normal
 *   npm run billing:reconcile -- reconcile <id>     una suscripción (id interno)
 *   npm run billing:reconcile -- reconcile-all      todo lo no terminal (lo mismo que el job)
 *
 * Contra una base remota pide escribir BILLING. Nunca imprime la URL de la
 * base, el Access Token ni el secret.
 */
const HELP = `Uso:
  npm run billing:reconcile -- list pending | past-due | price
  npm run billing:reconcile -- reconcile <id de suscripción>
  npm run billing:reconcile -- reconcile-all`;

const LISTS: Record<string, string> = {
  pending: `status = 'PENDING'`,
  'past-due': `status = 'PAST_DUE'`,
  price: `offer_redeemed_at IS NOT NULL AND offer_regular_price_applied_at IS NULL AND status <> 'CANCELLED'`,
};

async function main(): Promise<number> {
  config({ quiet: true });
  const { command, id } = parseArgs(process.argv.slice(2));
  if (command === 'help' || !['list', 'reconcile', 'reconcile-all'].includes(command)) {
    console.log(HELP);
    return command === 'help' ? 0 : 1;
  }
  if (command === 'list' && (!id || !LISTS[id])) {
    console.error(HELP);
    return 1;
  }
  if (command === 'reconcile' && !id) {
    console.error('Falta el id de la suscripción.\n\n' + HELP);
    return 1;
  }
  if (command !== 'list' && isRemoteDatabase(process.env.DATABASE_URL) && !(await confirmWord('BILLING'))) {
    console.log('Cancelado: no se modificó nada.');
    return 1;
  }
  process.env.BILLING_RECONCILE_INTERVAL_MINUTES = '0';
  // Contexto Nest completo: mismo proveedor, reglas y validación de env que la API.
  const { AppModule } = await import('../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    if (command === 'list') {
      const rows = await app.get(DataSource).query<
        { id: string; email: string; status: string; current_amount: number; created_at: Date }[]
      >(
        `SELECT s.id, u.email, s.status::text, s.current_amount, s.created_at
           FROM billing_subscriptions s
           JOIN professional_profiles p ON p.id = s.professional_id
           JOIN users u ON u.id = p.user_id
          WHERE ${LISTS[id!]} ORDER BY s.created_at ASC`,
      );
      if (!rows.length) console.log('Nada para mostrar.');
      for (const r of rows) {
        console.log(`${r.id}  ${r.email}  ${r.status}  $${r.current_amount}  desde ${r.created_at.toISOString().slice(0, 10)}`);
      }
      return 0;
    }
    const { BillingReconciler } = await import('./billing-reconciler.service');
    const reconciler = app.get(BillingReconciler);
    if (command === 'reconcile') {
      const result = await reconciler.reconcileById(id!);
      console.log(result === 'UNKNOWN' ? 'No existe esa suscripción (o el proveedor no la conoce).' : `Listo: ${result}.`);
      return result === 'UNKNOWN' ? 1 : 0;
    }
    const { checked, failed } = await reconciler.reconcileAll();
    console.log(`Revisadas ${checked}, con error ${failed}.`);
    return failed ? 1 : 0;
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
