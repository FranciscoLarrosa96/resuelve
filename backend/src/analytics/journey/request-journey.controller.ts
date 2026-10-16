import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from '../../common/auth/public.decorator';
import { RequestJourneyDto } from './request-journey.dto';
import { journeyDedupeKey } from './request-journey';

const JOURNEY_LIMIT = Number(process.env.THROTTLE_EVENTS_LIMIT ?? 30);

@ApiTags('analytics')
@Controller('analytics')
export class RequestJourneyController {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Pasos de un intento de pedido, en tandas. Público (el cliente puede ser invitado).
   * Solo guarda tipo, paso, recorrido y la clave aleatoria del intento: nada del
   * contenido del pedido. Los repetidos no suman. SENT no se acepta acá: lo
   * registra el servidor al enviar de verdad.
   */
  @Public()
  @Post('request-journey')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: JOURNEY_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ accepted } = eventos nuevos (los duplicados no suman)' })
  async record(@Body() dto: RequestJourneyDto): Promise<{ accepted: number }> {
    const rows = new Map<string, unknown[]>();
    for (const e of dto.events) {
      const step = e.type === 'STEP_VIEWED' ? (e.step ?? null) : null;
      if (e.type === 'STEP_VIEWED' && step === null) continue;
      const key = journeyDedupeKey(dto.attemptId, e.type, step);
      rows.set(key, [dto.attemptId, e.type, dto.journey, step, e.type === 'STARTED' ? (e.entry ?? null) : null, key]);
    }
    if (!rows.size) return { accepted: 0 };
    const values = [...rows.values()];
    const params = values.flat();
    const placeholders = values.map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`);
    const inserted = await this.dataSource.query<unknown[]>(
      `INSERT INTO request_journey_events (attempt_id, type, journey, step, entry, dedupe_key)
       VALUES ${placeholders.join(',')} ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      params,
    );
    return { accepted: inserted.length };
  }
}
