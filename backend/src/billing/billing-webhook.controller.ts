import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/auth/public.decorator';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { BillingWebhookService } from './billing-webhook.service';
import { signatureTimestamp, webhookSignatureError } from './webhook-signature';

const RESOURCE_ID = /^[A-Za-z0-9_-]{1,64}$/;

type NoticeBody = { type?: unknown; topic?: unknown; data?: { id?: unknown } };

/**
 * Webhooks de Suscripciones de Mercado Pago (tópicos
 * `subscription_preapproval` y `subscription_authorized_payment`).
 * Sin JWT: la firma `x-signature` es obligatoria (401 si falla, sin tocar
 * nada). 200 = recibido; 500 = no se pudo reconciliar y Mercado Pago lo
 * reintenta. Nunca loguea el body, la firma ni el secret.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('webhooks/mercado-pago')
export class BillingWebhookController {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly webhooks: BillingWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Post('subscriptions')
  @HttpCode(200)
  async subscriptions(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Query() query: Record<string, unknown>,
    @Body() body: NoticeBody,
  ) {
    const queryId = typeof query['data.id'] === 'string' ? query['data.id'] : undefined;
    const bodyId = body?.data?.id !== undefined && body.data.id !== null ? String(body.data.id) : undefined;
    const resourceId = queryId ?? bodyId;
    const topic = String(query.type ?? body?.type ?? query.topic ?? body?.topic ?? '');
    this.logger.log(`mp webhook received ${topic || '(sin tópico)'}`);

    const reason = webhookSignatureError({
      xSignature,
      xRequestId,
      dataId: queryId ?? bodyId,
      secret: this.config.get<string>('MP_WEBHOOK_SECRET'),
    });
    if (reason) {
      this.logger.warn(`mp webhook signature invalid (${reason})`);
      throw new AppException(ErrorCode.BILLING_INVALID_SIGNATURE, 'Firma inválida', HttpStatus.UNAUTHORIZED);
    }
    this.logger.log('mp webhook signature valid');
    if (!resourceId || !RESOURCE_ID.test(resourceId) || (bodyId && queryId && bodyId !== queryId)) {
      return { received: true, result: 'IGNORED' };
    }
    const result = await this.webhooks.handle({
      topic,
      resourceId,
      requestId: xRequestId ?? '',
      signatureTimestamp: signatureTimestamp(xSignature),
    });
    return { received: true, result };
  }
}
