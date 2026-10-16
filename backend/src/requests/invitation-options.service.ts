import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { Service } from '../catalog/service.entity';
import { countActiveQuotes } from '../quotes/active-quotes';
import { loadEligibilityProfiles } from '../professionals/professional-eligibility';
import { publicContactChannels } from '../professionals/contact/contact-rules';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { presentPublicProfessional } from '../professionals/professional.presenter';
import { FULL_RELATIONS } from '../professionals/professionals.service';
import { coverageGap, isPublicProfile } from '../professionals/professional-rules';
import { ProfessionalStatus } from '../professionals/professional.enums';
import { assessInvitees } from './invitation-eligibility';
import { MAX_INVITATIONS_PER_REQUEST, RequestStatus, RequestUrgency } from './request.enums';
import { RequestInvitation } from './request-invitation.entity';
import { ServiceRequest } from './service-request.entity';
import { DELAY_EXEMPT_URGENCIES } from './opportunity-access';

/** Desde cuándo sin presupuestos se destaca la sugerencia. Umbral inicial, para medir (no sale de datos). */
export const ADD_PROFESSIONALS_SUGGEST_AFTER_MINUTES = 60;
/** Cuántos recomendados / contactos directos se muestran como máximo. */
const MAX_OPTIONS = 6;
/** Preselección SQL antes de aplicar la regla exacta (cobertura por barrio, cupo, urgencias). */
const PRESELECT = 60;

export type InvitationOptionsState =
  /** Hay a quién sumar. */
  | 'AVAILABLE'
  /** Se llegó al máximo de invitados. */
  | 'LIMIT_REACHED'
  /** Nadie más puede responder esta invitación. */
  | 'NO_CANDIDATES'
  /** Los lugares para presupuestos ya están cubiertos. */
  | 'QUOTES_FULL'
  /** No corresponde ofrecerlo: no enviado, con presupuestos o en otro estado. */
  | 'NOT_APPLICABLE';

type PublicPro = ReturnType<typeof presentPublicProfessional>;

/**
 * "Sumar profesionales" a un pedido enviado y todavía sin presupuestos (Fase 2 de la auditoría).
 * Solo lee y arma recomendaciones: sumar sigue siendo `POST /requests/:id/invitations`, que
 * revalida con la MISMA regla (`assessInvitees`) cuando el cliente confirma. Nada se suma solo
 * ni se avisa por tiempo transcurrido.
 */
@Injectable()
export class InvitationOptionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async get(clientId: string, requestId: string) {
    const m = this.dataSource.manager;
    const request = await m.findOne(ServiceRequest, { where: { id: requestId, clientId } });
    if (!request) throw AppException.notFound('Solicitud');

    const now = new Date();
    const invitations = await m.findBy(RequestInvitation, { requestId });
    const invitedIds = new Set(invitations.map((i) => i.professionalId));
    const maxActiveQuotes = this.config.get<number>('MAX_ACTIVE_QUOTES_PER_REQUEST', 5);
    const activeQuotes = await countActiveQuotes(m, requestId, now);
    const sentAt = invitations.length ? new Date(Math.min(...invitations.map((i) => i.sentAt.getTime()))) : null;
    const urgent = DELAY_EXEMPT_URGENCIES.includes(request.urgency);
    const suggestFrom = sentAt ? new Date(sentAt.getTime() + ADD_PROFESSIONALS_SUGGEST_AFTER_MINUTES * 60_000) : null;
    const waitingMinutes = sentAt ? Math.max(0, Math.floor((now.getTime() - sentAt.getTime()) / 60_000)) : null;

    const base = {
      requestId,
      urgent,
      invited: invitations.length,
      maxInvitations: MAX_INVITATIONS_PER_REQUEST,
      remainingInvitations: Math.max(0, MAX_INVITATIONS_PER_REQUEST - invitations.length),
      activeQuotes,
      maxActiveQuotes,
      waitingMinutes,
      suggestAfterMinutes: ADD_PROFESSIONALS_SUGGEST_AFTER_MINUTES,
      suggestFrom: suggestFrom?.toISOString() ?? null,
      // Hoy/urgente: orientación desde el inicio. El resto: se destaca pasado el umbral sin presupuestos.
      emphasis: urgent ? ('URGENT_GUIDE' as const) : suggestFrom && now >= suggestFrom ? ('SUGGEST' as const) : ('NONE' as const),
    };
    const empty = { candidates: [] as PublicPro[], directContacts: [] as PublicPro[] };

    // Solo un pedido ya enviado, esperando y sin presupuestos.
    if (request.status !== RequestStatus.WAITING_QUOTES || !invitations.length || activeQuotes > 0) {
      return { ...base, ...empty, state: 'NOT_APPLICABLE' as InvitationOptionsState, emphasis: 'NONE' as const };
    }

    const service = await m.findOneByOrFail(Service, { id: request.serviceId });
    const ctx = { service, cityId: request.cityId, zoneId: request.zoneId, urgency: request.urgency, targeted: false };

    // Recomendados: pueden recibir Y responder esta invitación (misma regla que el endpoint).
    const candidates: PublicPro[] = [];
    const roomForQuotes = activeQuotes < maxActiveQuotes;
    if (base.remainingInvitations > 0 && roomForQuotes) {
      const ids = await this.preselect(request, clientId, invitedIds, { requests: true });
      const profiles = [...(await loadEligibilityProfiles(m, ids)).values()];
      const blocks = await assessInvitees(m, this.config, profiles, ctx, now);
      const ok = ids.filter((id) => blocks.get(id) === null).slice(0, MAX_OPTIONS);
      candidates.push(...(await this.present(ok)));
    }

    // Contacto directo: quien lo habilitó, aunque no pueda responder por Resuelve (p. ej. Free sin
    // cupo o con solicitudes apagadas). Un clic no crea invitación, ni presupuesto, ni trabajo.
    const directIds = await this.preselect(request, clientId, new Set(), { requests: false });
    const directProfiles = [...(await loadEligibilityProfiles(m, directIds)).values()].filter((p) => {
      const c = publicContactChannels(p);
      return (
        isPublicProfile(p) &&
        (c.whatsapp || c.phone) &&
        coverageGap(p, { cityId: request.cityId, zoneId: request.zoneId }) === null &&
        (request.urgency !== RequestUrgency.URGENT || p.takesUrgencies)
      );
    });
    const directOrdered = directIds
      .filter((id) => directProfiles.some((p) => p.id === id))
      // Quien todavía no fue invitado primero: ya es una opción nueva.
      .sort((a, b) => Number(invitedIds.has(a)) - Number(invitedIds.has(b)));
    const directContacts = (await this.present(directOrdered.slice(0, MAX_OPTIONS))).map((p) => ({
      ...p,
      invited: invitedIds.has(p.id),
    }));

    const state: InvitationOptionsState =
      base.remainingInvitations === 0
        ? 'LIMIT_REACHED'
        : !roomForQuotes
          ? 'QUOTES_FULL'
          : candidates.length === 0
            ? 'NO_CANDIDATES'
            : 'AVAILABLE';
    return { ...base, state, candidates, directContacts };
  }

  /**
   * Ids de perfiles activos que ofrecen el servicio y trabajan en la localidad (el barrio y el
   * resto se evalúan exacto después), sin el cliente mismo, en orden orgánico: nunca por plan.
   */
  private async preselect(
    request: ServiceRequest,
    clientId: string,
    exclude: Set<string>,
    opts: { requests: boolean },
  ): Promise<string[]> {
    const rows: { id: string }[] = await this.dataSource
      .getRepository(ProfessionalProfile)
      .createQueryBuilder('p')
      .select('p.id', 'id')
      .where('p.status = :active', { active: ProfessionalStatus.ACTIVE })
      .andWhere('p.user_id <> :clientId', { clientId })
      .andWhere(
        `EXISTS (SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
                  WHERE ps.professional_id = p.id AND ps.service_id = :serviceId AND s.active)`,
        { serviceId: request.serviceId },
      )
      .andWhere(
        `EXISTS (SELECT 1 FROM professional_localities pl WHERE pl.professional_id = p.id AND pl.city_id = :cityId)`,
        { cityId: request.cityId },
      )
      .andWhere(opts.requests ? 'p.contact_requests_enabled' : '1 = 1')
      .addSelect(request.urgency === RequestUrgency.URGENT ? 'p.takes_urgencies' : 'true', 'urg')
      .orderBy('urg', 'DESC')
      .addOrderBy('p.average_rating', 'DESC', 'NULLS LAST')
      .addOrderBy('p.reviews_count', 'DESC')
      .addOrderBy('p.id', 'ASC')
      .limit(PRESELECT)
      .getRawMany();
    return rows.map((r) => r.id).filter((id) => !exclude.has(id));
  }

  private async present(ids: string[]): Promise<PublicPro[]> {
    if (!ids.length) return [];
    const found = await this.dataSource
      .getRepository(ProfessionalProfile)
      .find({ where: ids.map((id) => ({ id })), relations: FULL_RELATIONS });
    const byId = new Map(found.map((p) => [p.id, p]));
    return ids.map((id) => presentPublicProfessional(byId.get(id)!));
  }
}
