import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/auth/public.decorator';
import { WithdrawalContactRequestDto } from './transfer.dto';
import { WithdrawalRequestsService } from './withdrawal-requests.service';

/** Límite por IP y por minuto del formulario público (además de los topes por correo y por día del servicio). */
const PUBLIC_WITHDRAWAL_LIMIT = Number(process.env.THROTTLE_WITHDRAWAL_REQUEST_LIMIT ?? 4);

/**
 * "No puedo ingresar a mi cuenta": registra una solicitud de arrepentimiento SIN sesión. Solo guarda la
 * solicitud y devuelve el comprobante (código y fecha del servidor); no consulta cuentas ni pagos, así que
 * la respuesta no revela nada y no modifica accesos, pagos ni devoluciones.
 */
@ApiTags('billing')
@Public()
@Controller('withdrawal-requests')
export class WithdrawalRequestsController {
  constructor(private readonly requests: WithdrawalRequestsService) {}

  @Post()
  @Throttle({ default: { limit: PUBLIC_WITHDRAWAL_LIMIT, ttl: 60_000 } })
  @ApiCreatedResponse({ description: '{ code, requestedAt } · 409 WITHDRAWAL_REQUEST_LIMIT' })
  submit(@Body() dto: WithdrawalContactRequestDto) {
    return this.requests.submit(dto);
  }
}
