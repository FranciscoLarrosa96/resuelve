import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 1 (demora de Free): la demora ahora existe solo si un PRO del mismo pedido tuvo acceso
 * antes, y nunca en pedidos de hoy/urgentes (`opportunity-access.ts`). Las solicitudes ya
 * enviadas y todavía demoradas se liberan al LEER (`resolveOpportunityTiming`), sin tocar
 * `request_invitations`: lo registrado es evidencia histórica.
 *
 * Esta migración solo acompaña a esos profesionales con el aviso: los "Nueva solicitud" de
 * Free cuya liberación sigue en el futuro y cuya demora no se justifica (pedido de hoy/urgente
 * o sin acceso anticipado de un PRO registrado) pasan a estar disponibles ya. No cambia
 * invitaciones, eventos ni textos. Acotada a lo pendiente (la demora dura minutos).
 */
export class ReleaseUnprovenFreeDelays1795600000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE notifications n SET available_at = NULL
        FROM professional_profiles p, request_invitations i, service_requests sr
       WHERE n.type::text = 'PRO_REQUEST_RECEIVED' AND n.available_at > now()
         AND p.user_id = n.user_id AND i.request_id = n.request_id AND i.professional_id = p.id
         AND sr.id = n.request_id
         AND NOT i.targeted AND i.available_at > i.sent_at
         AND (sr.urgency::text IN ('TODAY', 'URGENT') OR NOT EXISTS (
               SELECT 1 FROM pro_funnel_events pe
                WHERE pe.type = 'EARLY_OPPORTUNITY_DELIVERED' AND pe.ref = i.request_id::text
                  AND pe.context->>'billingPlan' IN ('PRO', 'PRO_PLUS') AND pe.context->>'earlyAccess' = 'true'
                  AND pe.occurred_at < i.available_at))`);
  }

  async down(): Promise<void> {
    // Sin efecto: un aviso ya liberado no se vuelve a demorar (la fecha original no se guarda
    // porque era solo una espera de minutos, y las invitaciones conservan la suya).
  }
}
