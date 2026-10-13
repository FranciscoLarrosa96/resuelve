import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { CreateQuoteTemplateDto } from './quote-template.dto';
import { QuoteTemplate } from './quote-template.entity';
import { MAX_QUOTE_TEMPLATES } from './quote-template-rules';

export function presentQuoteTemplate(t: QuoteTemplate) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    note: t.note,
    estimatedDuration: t.estimatedDuration,
    laborAmount: t.laborAmount,
    materialsAmount: t.materialsAmount,
    createdAt: t.createdAt,
  };
}

/** Plantillas del profesional logueado. Toda respuesta es la lista completa (la más nueva primero). */
@Injectable()
export class QuoteTemplatesService {
  constructor(private readonly dataSource: DataSource) {}

  async list(pro: ProfessionalProfile) {
    const items = await this.dataSource
      .getRepository(QuoteTemplate)
      .find({ where: { professionalId: pro.id }, order: { createdAt: 'DESC' } });
    return { items: items.map(presentQuoteTemplate), max: MAX_QUOTE_TEMPLATES };
  }

  async create(pro: ProfessionalProfile, dto: CreateQuoteTemplateDto) {
    await this.dataSource.transaction(async (m) => {
      // Lock del perfil: dos pestañas no pasan el tope a la vez.
      await m.getRepository(ProfessionalProfile).findOne({ where: { id: pro.id }, lock: { mode: 'pessimistic_write' } });
      const count = await m.count(QuoteTemplate, { where: { professionalId: pro.id } });
      if (count >= MAX_QUOTE_TEMPLATES) {
        throw AppException.conflict(
          ErrorCode.QUOTE_TEMPLATES_LIMIT_REACHED,
          `Podés guardar hasta ${MAX_QUOTE_TEMPLATES} plantillas. Borrá una para guardar otra.`,
        );
      }
      await m.save(
        m.create(QuoteTemplate, {
          professionalId: pro.id,
          name: dto.name,
          description: dto.description,
          note: dto.note || null,
          estimatedDuration: dto.estimatedDuration || null,
          laborAmount: dto.laborAmount,
          materialsAmount: dto.materialsAmount,
        }),
      );
    });
    return this.list(pro);
  }

  /** Solo el dueño: la de otro perfil responde 404 (no se revela que existe). */
  async remove(pro: ProfessionalProfile, id: string) {
    const result = await this.dataSource.getRepository(QuoteTemplate).delete({ id, professionalId: pro.id });
    if (!result.affected) throw AppException.notFound('Plantilla');
    return this.list(pro);
  }
}
