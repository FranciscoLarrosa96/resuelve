import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BILLING_PROVIDER, BillingProvider, DisabledBillingProvider } from './billing-provider';
import { BillingReconciler } from './billing-reconciler.service';
import { BillingScheduler } from './billing-scheduler.service';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingWebhookService } from './billing-webhook.service';
import { FakeBillingProvider } from './fake-billing.provider';
import { FakeCheckoutController } from './fake-checkout.controller';
import { MercadoPagoBillingProvider } from './mercado-pago.provider';


export function createBillingProvider(config: ConfigService): BillingProvider {
  switch (config.get<string>('BILLING_PROVIDER', 'none')) {
    case 'mercadopago':
      return new MercadoPagoBillingProvider({
        accessToken: config.getOrThrow<string>('MP_ACCESS_TOKEN').trim(),
        timeoutMs: config.get<number>('MP_TIMEOUT_MS', 10000),
        apiBase: config.get<string>('MP_API_BASE'),
      });
    case 'fake': {
      const fake = new FakeBillingProvider();
      fake.checkoutBase = `http://localhost:${config.get<number>('PORT', 3000)}/api/v1/billing/fake-checkout`;
      return fake;
    }
    default:
      return new DisabledBillingProvider();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile])],
  controllers: [BillingController, BillingWebhookController, FakeCheckoutController],
  providers: [
    { provide: BILLING_PROVIDER, inject: [ConfigService], useFactory: createBillingProvider },
    BillingService,
    BillingReconciler,
    BillingWebhookService,
    BillingScheduler,
    ProfessionalGuard,
  ],
  exports: [BillingService, BillingReconciler, BILLING_PROVIDER],
})
export class BillingModule {}
