import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ExposureEvent, ExposureEventType } from '../../analytics/exposure-event.entity';
import { exposureDedupeKey, sha256 } from '../../analytics/exposure';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ContactRevealDto, ContactSettingsDto } from '../dto/professional.dto';
import { ProfessionalProfile } from '../professional-profile.entity';
import { contactNumberFor } from './contact-rules';
import { formatPhone, isNormalized, normalizePhone, telLink, whatsappLink } from './phone';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ContactReveal {
  channel: 'WHATSAPP' | 'PHONE';
  /** `https://wa.me/549…?text=…` o `tel:+549…`. */
  href: string;
  /** E.164, para copiar. */
  number: string;
  /** "+54 9 249 412-3456". */
  display: string;
}

/**
 * Canales de contacto directo: configuración (el dueño) y entrega del número (público).
 *
 * El número nunca viaja en listados ni en la ficha: se entrega por canal, al tocar el
 * botón, con límite por IP (controller) y registrando el clic de forma anónima. No es
 * una barrera infalible —un número publicado puede copiarse— pero evita regalarlo en
 * cada respuesta de búsqueda y en el HTML prerenderizado.
 */
@Injectable()
export class ContactService {
  constructor(private readonly dataSource: DataSource) {}

  /** Guarda la configuración completa. Reglas: consentimiento para WhatsApp/llamadas, números válidos y al menos un canal. */
  async update(profileId: string, dto: ContactSettingsDto): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const current = await m.findOneOrFail(ProfessionalProfile, {
        where: { id: profileId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!dto.whatsappEnabled && !dto.callsEnabled && !dto.requestsEnabled) {
        throw AppException.unprocessable(
          ErrorCode.CONTACT_CHANNEL_REQUIRED,
          'Elegí al menos una forma de contacto',
        );
      }
      if (!dto.consent) {
        if (dto.whatsappEnabled || dto.callsEnabled) {
          throw AppException.unprocessable(
            ErrorCode.CONTACT_CONSENT_REQUIRED,
            'Para mostrar tu WhatsApp o tu teléfono tenés que aceptar que otros usuarios lo vean',
          );
        }
        // Retira el consentimiento: no se publica nada y los números se borran.
        await m.update(ProfessionalProfile, profileId, {
          contactWhatsappEnabled: false,
          contactCallsEnabled: false,
          contactRequestsEnabled: dto.requestsEnabled,
          contactWhatsappNumber: null,
          contactPhoneNumber: null,
          contactConsentAt: null,
        });
        return;
      }

      const whatsapp = this.number(dto.whatsappNumber, current.contactWhatsappNumber, 'MOBILE', dto.whatsappEnabled, 'whatsappNumber');
      const phone = this.number(dto.phoneNumber, current.contactPhoneNumber, dto.phoneKind ?? 'MOBILE', dto.callsEnabled, 'phoneNumber');
      await m.update(ProfessionalProfile, profileId, {
        contactWhatsappEnabled: dto.whatsappEnabled,
        contactCallsEnabled: dto.callsEnabled,
        contactRequestsEnabled: dto.requestsEnabled,
        contactWhatsappNumber: whatsapp,
        contactPhoneNumber: phone,
        // La fecha es la del primer consentimiento vigente (editar no la renueva).
        contactConsentAt: current.contactConsentAt ?? new Date(),
      });
    });
  }

  /**
   * `undefined` = conservar el guardado; null o "" = borrarlo. Obligatorio si el canal
   * queda habilitado. Devuelve el E.164 a guardar.
   */
  private number(
    input: string | null | undefined,
    stored: string | null,
    kind: 'MOBILE' | 'LANDLINE',
    required: boolean,
    field: 'whatsappNumber' | 'phoneNumber',
  ): string | null {
    let value: string | null;
    if (input === undefined) {
      value = stored;
    } else if (input === null || !input.trim()) {
      value = null;
    } else {
      const parsed = normalizePhone(input, kind);
      if (!isNormalized(parsed)) {
        throw AppException.unprocessable(
          ErrorCode.INVALID_PHONE,
          'Revisá el número: escribilo con la característica (ej. 249 15 412-3456) o con + si es de otro país',
          { field },
        );
      }
      value = parsed.e164;
    }
    if (required && !value) {
      throw AppException.unprocessable(ErrorCode.INVALID_PHONE, 'Falta el número para este canal', { field });
    }
    return value;
  }

  /**
   * Entrega el enlace de un canal directo y registra el clic (anónimo, deduplicado por
   * sesión y canal cada 30 min; el profesional tocando su propio botón no cuenta).
   * No crea solicitudes, no toca cupos ni primer éxito. 404 si el perfil no es público o
   * el canal no está disponible (no revela si existe un número sin consentimiento).
   */
  async reveal(professionalId: string, dto: ContactRevealDto, user?: AuthUser): Promise<ContactReveal> {
    if (!UUID.test(professionalId)) throw AppException.notFound('Profesional');
    const profile = await this.dataSource.manager.findOneBy(ProfessionalProfile, { id: professionalId });
    const number = profile ? contactNumberFor(profile, dto.channel) : null;
    if (!profile || !number) throw AppException.notFound('Contacto');

    if (dto.sessionKey && profile.userId !== user?.userId) {
      const type = dto.channel === 'WHATSAPP' ? ExposureEventType.WHATSAPP_CLICK : ExposureEventType.PHONE_CLICK;
      const sessionKeyHash = sha256(`resuelve-session|${dto.sessionKey}`);
      const ctx = { type, professionalId, serviceId: null, zoneId: null, isUrgent: null, page: null };
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(ExposureEvent)
        .values({
          ...ctx,
          isFeaturedPlacement: false,
          sessionKeyHash,
          dedupeKey: exposureDedupeKey(ctx, sessionKeyHash),
        })
        .orIgnore()
        .execute();
    }

    return {
      channel: dto.channel,
      href: dto.channel === 'WHATSAPP' ? whatsappLink(number) : telLink(number),
      number,
      display: formatPhone(number),
    };
  }
}
