import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/auth/public.decorator';
import { AppException } from '../common/errors/app-exception';
import { BILLING_PROVIDER, BillingProvider } from './billing-provider';
import { BillingReconciler } from './billing-reconciler.service';
import { FakeBillingProvider } from './fake-billing.provider';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Checkout FALSO de Mercado Pago para desarrollo local y Playwright
 * (`BILLING_PROVIDER=fake`, nunca en producción). "Autorizar" hace lo que
 * haría Mercado Pago: autoriza, cobra el primer ciclo, avisa (reconcilia como
 * un webhook) y vuelve a `back_url`. No cobra nada.
 */
@ApiExcludeController()
@Public()
@Controller('billing/fake-checkout')
export class FakeCheckoutController {
  constructor(
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly reconciler: BillingReconciler,
    private readonly config: ConfigService,
  ) {}

  private fake(): FakeBillingProvider {
    if (!(this.provider instanceof FakeBillingProvider) || this.config.get('NODE_ENV') === 'production') {
      throw AppException.notFound('Checkout');
    }
    return this.provider;
  }

  @Get(':id')
  async page(@Param('id') id: string, @Res() res: Response) {
    const sub = await this.fake().getSubscription(id);
    if (!sub) throw AppException.notFound('Checkout');
    const amount = `$${(sub.amount ?? 0).toLocaleString('es-AR')}`;
    const base = `/api/v1/billing/fake-checkout/${esc(id)}`;
    res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mercado Pago (prueba)</title></head>
<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a">
<p style="font-size:13px;color:#555">Checkout de PRUEBA · no se cobra nada</p>
<h1 style="font-size:22px">Resuelve PRO</h1>
<p>Suscripción mensual: <strong data-testid="fake-amount">${amount}</strong> / mes</p>
<p style="display:flex;gap:.75rem;margin-top:1.5rem">
<a data-testid="fake-authorize" href="${base}/authorize" style="background:#009ee3;color:#fff;padding:.75rem 1.25rem;border-radius:.5rem;text-decoration:none">Autorizar suscripción</a>
<a data-testid="fake-reject" href="${base}/reject" style="padding:.75rem 1.25rem;color:#1a1a1a">Tarjeta rechazada</a>
<a data-testid="fake-leave" href="${base}/leave" style="padding:.75rem 1.25rem;color:#1a1a1a">Volver sin pagar</a>
</p></body></html>`);
  }

  @Get(':id/authorize')
  async authorize(@Param('id') id: string, @Res() res: Response) {
    const fake = this.fake();
    fake.authorize(id);
    const payment = fake.charge(id, 'approved');
    await this.reconciler.reconcileSubscription(id);
    await this.reconciler.reconcilePayment(payment.id);
    res.redirect(303, this.back(fake, id));
  }

  @Get(':id/reject')
  async reject(@Param('id') id: string, @Res() res: Response) {
    const fake = this.fake();
    fake.authorize(id);
    const payment = fake.charge(id, 'rejected');
    await this.reconciler.reconcileSubscription(id);
    await this.reconciler.reconcilePayment(payment.id);
    res.redirect(303, this.back(fake, id));
  }

  @Get(':id/leave')
  leave(@Param('id') id: string, @Res() res: Response) {
    res.redirect(303, this.back(this.fake(), id));
  }

  private back(fake: FakeBillingProvider, id: string): string {
    const url = new URL(fake.backUrlOf(id) ?? 'http://localhost:4200/pro/plan/resultado');
    url.searchParams.set('preapproval_id', id);
    return url.toString();
  }
}
