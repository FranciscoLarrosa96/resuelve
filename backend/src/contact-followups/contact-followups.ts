import type { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';

/**
 * «¿Lo contrataste?»: unos días después de tocar WhatsApp o Llamar en un perfil, al
 * cliente con sesión se le pregunta si contrató al profesional. Si dice que sí, va a la
 * reseña por invitación (se muestra aparte y no suma al puntaje, `reviews/invited-review.ts`).
 * - Solo con sesión iniciada y nunca a uno mismo; el profesional no ve estas filas.
 * - Se pregunta una vez por profesional: responder (sí o no) la cierra.
 * - No se pregunta si ya lo reseñó o si lo contrató por Resuelve (ese trabajo tiene su reseña).
 * - Pasados `MAX_AGE_DAYS` sin responder, deja de preguntarse.
 */
export const CONTACT_FOLLOWUP_MAX_AGE_DAYS = 30;
export const CONTACT_FOLLOWUP_LIMIT = 3;

export type ContactChannel = 'WHATSAPP' | 'PHONE';
export type ContactFollowupAnswer = 'HIRED' | 'NOT_HIRED';

export const contactFollowupAfterHours = (config: ConfigService) =>
  Math.max(1, Math.min(14 * 24, config.get<number>('CONTACT_FOLLOWUP_AFTER_HOURS', 48)));

/** El toque de contacto (con sesión): crea o renueva la pregunta pendiente; una respondida no se reabre. */
export async function recordContactFollowup(
  db: Pick<EntityManager, 'query'>,
  userId: string,
  professionalId: string,
  channel: ContactChannel,
  at = new Date(),
): Promise<void> {
  await db.query(
    `INSERT INTO contact_followups (user_id, professional_id, channel, contacted_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, professional_id) DO UPDATE
       SET channel = EXCLUDED.channel, contacted_at = EXCLUDED.contacted_at
     WHERE contact_followups.answered_at IS NULL`,
    [userId, professionalId, channel, at],
  );
}

export interface PendingContactFollowup {
  professionalId: string;
  name: string;
  headline: string | null;
  avatarUrl: string | null;
  channel: ContactChannel;
  contactedAt: string;
}

/** Las preguntas que le tocan hoy (las más recientes primero, máx. 3). */
export async function pendingContactFollowups(
  db: Pick<EntityManager, 'query'>,
  userId: string,
  config: ConfigService,
  now = new Date(),
): Promise<PendingContactFollowup[]> {
  const rows: {
    professional_id: string;
    first_name: string;
    last_name: string;
    headline: string | null;
    avatar_url: string | null;
    channel: ContactChannel;
    contacted_at: Date;
  }[] = await db.query(
    `SELECT f.professional_id, u.first_name, u.last_name, p.headline, p.avatar_url, f.channel, f.contacted_at
       FROM contact_followups f
       JOIN professional_profiles p ON p.id = f.professional_id
       JOIN users u ON u.id = p.user_id
      WHERE f.user_id = $1 AND f.answered_at IS NULL
        AND f.contacted_at <= $2::timestamptz - make_interval(hours => $3)
        AND f.contacted_at > $2::timestamptz - make_interval(days => $4)
        AND p.status = 'ACTIVE' AND u.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.professional_id = f.professional_id AND r.client_id = $1)
        AND NOT EXISTS (
          SELECT 1 FROM service_requests sr
           WHERE sr.client_id = $1 AND sr.selected_professional_id = f.professional_id)
      ORDER BY f.contacted_at DESC
      LIMIT $5`,
    [userId, now, contactFollowupAfterHours(config), CONTACT_FOLLOWUP_MAX_AGE_DAYS, CONTACT_FOLLOWUP_LIMIT],
  );
  return rows.map((r) => ({
    professionalId: r.professional_id,
    name: `${r.first_name} ${r.last_name}`.trim(),
    headline: r.headline,
    avatarUrl: r.avatar_url,
    channel: r.channel,
    contactedAt: new Date(r.contacted_at).toISOString(),
  }));
}

/** Responde la pregunta (una sola vez). false = no había una pendiente. */
export async function answerContactFollowup(
  db: Pick<EntityManager, 'query'>,
  userId: string,
  professionalId: string,
  answer: ContactFollowupAnswer,
): Promise<boolean> {
  const updated: unknown[] = await db.query(
    `WITH answered AS (
       UPDATE contact_followups SET answer = $3, answered_at = now()
        WHERE user_id = $1 AND professional_id = $2 AND answered_at IS NULL RETURNING id
     ) SELECT id FROM answered`,
    [userId, professionalId, answer],
  );
  return updated.length > 0;
}
