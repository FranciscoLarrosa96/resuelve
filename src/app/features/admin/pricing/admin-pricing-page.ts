import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PRO_PRICE_LIMITS, PRO_PRICE_TEST_BELOW } from '../../../core/models/admin';
import { AdminPricingStore } from '../../../core/state/admin-pricing.store';
import { formatTimestamp } from '../../../core/utils/dates';
import { formatARS, formatThousands, onlyDigits } from '../../../core/utils/format';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Logo } from '../../../shared/components/logo/logo';

/**
 * Precio mensual de Resuelve PRO (solo admin). Rige para suscripciones NUEVAS:
 * quien ya paga conserva su monto. La promo de bienvenida se recalcula sola
 * sobre el precio nuevo (mismo descuento).
 */
@Component({
  selector: 'app-admin-pricing-page',
  imports: [RouterLink, Dialog, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="sticky top-0 z-20 border-b border-track bg-canvas/95 backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
        <a routerLink="/" class="shrink-0 rounded-lg" aria-label="Resuelve, inicio"><app-logo /></a>
        <span class="hidden rounded-md bg-sand-dark px-1.5 py-0.5 text-[14px] font-semibold text-ink-soft sm:inline"
          >Admin</span
        >
        <nav class="ml-auto flex items-center" aria-label="Secciones del panel">
          <a
            routerLink="/admin/matriculas"
            class="rounded-lg px-2.5 py-2 text-[14px] sm:px-3 font-semibold text-ink-soft hover:bg-sand"
            >Matrículas</a
          >
          <a
            routerLink="/admin/reportes"
            class="rounded-lg px-2.5 py-2 text-[14px] sm:px-3 font-semibold text-ink-soft hover:bg-sand"
            >Reportes</a
          >
          <a
            routerLink="/admin/precio"
            aria-current="page"
            class="rounded-lg bg-sand px-2.5 py-2 text-[14px] sm:px-3 font-semibold text-ink"
            >Precio</a
          >
        </nav>
      </div>
    </header>

    <main id="main" class="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <h1
        class="font-display text-[30px] leading-tight font-bold tracking-[-0.02em] sm:text-[34px]"
      >
        Precio de Resuelve PRO
      </h1>
      <p class="mt-1.5 text-[15px] text-ink-soft">
        El precio nuevo rige solo para suscripciones nuevas. Quien ya paga PRO conserva su monto.
      </p>

      @switch (store.state()) {
        @case ('error') {
          <div class="mt-5 rounded-2xl border border-line bg-surface p-5" role="alert">
            <p class="text-[15px] font-semibold">No pudimos cargar el precio.</p>
            <button
              type="button"
              class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14.5px] font-bold"
              (click)="store.load()"
            >
              Reintentar
            </button>
          </div>
        }
        @case ('ready') {
          @if (store.pricing(); as p) {
            @if (!p.selfServe) {
              <p
                class="mt-5 rounded-xl bg-sand px-3.5 py-2.5 text-[14px] text-ink-soft"
                data-testid="no-billing"
              >
                El cobro online está apagado en este entorno: el precio se muestra en la página de
                planes pero no se cobra.
              </p>
            }

            <section
              class="mt-6 rounded-2xl border border-line bg-surface p-5"
              aria-labelledby="current"
            >
              <h2 id="current" class="text-[14px] font-semibold text-muted">Precio vigente</h2>
              <p class="mt-1 font-display text-[36px] leading-none font-bold" data-testid="current">
                {{ ars(p.monthlyPriceArs) }}
                <span class="font-sans text-[16px] font-medium text-muted">por mes</span>
              </p>
              @if (p.introOffer; as o) {
                <p class="mt-2 text-[14.5px] text-ink-soft" data-testid="intro">
                  Oferta de bienvenida ({{ o.discountPercent }}% OFF):
                  <strong class="font-semibold text-ink">{{ ars(o.discountedPriceArs) }}</strong>
                  {{ o.cycles === 1 ? 'el primer mes' : 'los primeros ' + o.cycles + ' meses' }}.
                </p>
              }
              <p class="mt-1 text-[13.5px] text-muted">
                {{
                  p.source === 'ADMIN'
                    ? 'Fijado desde este panel.'
                    : 'Valor inicial del servidor (' + ars(p.defaultPriceArs) + ').'
                }}
              </p>
            </section>

            <section
              class="mt-4 rounded-2xl border border-line bg-surface p-5"
              aria-labelledby="change"
            >
              <h2 id="change" class="text-[17px] font-bold">Cambiar el precio</h2>
              <label for="price" class="mt-3 block text-[15px] font-semibold text-ink"
                >Nuevo precio mensual (pesos)</label
              >
              <div class="relative mt-1.5 max-w-xs">
                <span
                  class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
                  >$</span
                >
                <input
                  id="price"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  class="h-12 w-full min-w-0 rounded-xl field-control pr-3.5 pl-8 text-base text-ink"
                  [value]="shown()"
                  (input)="onInput($event)"
                  [attr.aria-describedby]="'price-hint'"
                  [attr.aria-invalid]="touched() && !valid() ? 'true' : null"
                />
              </div>
              <p id="price-hint" class="mt-1.5 text-[13.5px] text-muted">
                Entre {{ ars(limits.min) }} y {{ ars(limits.max) }}.
                @if (promoPreview() !== null) {
                  Con la oferta de bienvenida, el primer cobro sería
                  <strong class="font-semibold text-ink">{{ ars(promoPreview()!) }}</strong
                  >.
                }
              </p>
              @if (isTest()) {
                <p
                  class="mt-2 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[14px] font-medium text-accent-ink"
                  data-testid="test-warning"
                >
                  Precio de prueba: cualquier profesional que se suscriba mientras esté puesto va a
                  pagar {{ ars(price()) }}. Volvé al precio real cuando termines de probar.
                </p>
              }
              @if (touched() && !valid()) {
                <p class="mt-1.5 text-[14px] font-medium text-danger" role="alert">
                  Ingresá un monto entre {{ ars(limits.min) }} y {{ ars(limits.max) }}.
                </p>
              }
              @if (store.actionError()) {
                <p
                  class="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger"
                  role="alert"
                >
                  {{ store.actionError() }}
                </p>
              }
              @if (saved()) {
                <p
                  class="mt-3 text-[14px] font-medium text-brand"
                  role="status"
                  data-testid="saved"
                >
                  Precio actualizado. Ya lo ven los profesionales que se suscriban desde ahora.
                </p>
              }
              <button
                type="button"
                class="button-primary mt-4 min-h-12 rounded-xl px-5 text-[16px] font-semibold disabled:opacity-60"
                [disabled]="store.saving()"
                (click)="askConfirm()"
                data-testid="save"
              >
                Guardar precio
              </button>
            </section>

            @if (p.inUse.length) {
              <section
                class="mt-4 rounded-2xl border border-line bg-surface p-5"
                aria-labelledby="inuse"
              >
                <h2 id="inuse" class="text-[17px] font-bold">Quién paga cuánto hoy</h2>
                <p class="mt-1 text-[14px] text-muted">
                  Suscripciones activas o en mora. Conservan su monto aunque cambie el precio.
                </p>
                <ul class="mt-3 divide-y divide-line-soft text-[15px]">
                  @for (u of p.inUse; track u.amountArs) {
                    <li class="flex justify-between py-2">
                      <span>{{ ars(u.amountArs) }} por mes</span>
                      <span class="tabular-nums text-ink-soft"
                        >{{ u.subscriptions }}
                        {{ u.subscriptions === 1 ? 'suscripción' : 'suscripciones' }}</span
                      >
                    </li>
                  }
                </ul>
              </section>
            }

            <section
              class="mt-4 rounded-2xl border border-line bg-surface p-5"
              aria-labelledby="history"
            >
              <h2 id="history" class="text-[17px] font-bold">Historial de cambios</h2>
              @if (!p.history.length) {
                <p class="mt-2 text-[14.5px] text-muted">
                  Todavía no se cambió el precio desde el panel.
                </p>
              } @else {
                <ul class="mt-3 divide-y divide-line-soft text-[14.5px]" data-testid="history">
                  @for (h of p.history; track h.createdAt) {
                    <li class="py-2">
                      <strong class="font-semibold"
                        >{{ ars(h.previousPriceArs) }} → {{ ars(h.priceArs) }}</strong
                      >
                      <span class="block text-[13.5px] text-muted"
                        >{{ h.changedBy }} · {{ when(h.createdAt) }}</span
                      >
                    </li>
                  }
                </ul>
              }
            </section>
          }
        }
        @default {
          <p class="mt-6 text-[15px] text-muted" role="status">Cargando precio…</p>
        }
      }
    </main>

    <app-dialog
      [open]="confirming()"
      labelledBy="confirm-title"
      [dismissable]="!store.saving()"
      (dismiss)="confirming.set(false)"
    >
      <h2 id="confirm-title" class="font-display text-2xl font-bold">Confirmar el nuevo precio</h2>
      @if (store.pricing(); as p) {
        <p class="mt-2 text-[15px] leading-6 text-ink" data-testid="confirm-text">
          PRO pasa de <strong>{{ ars(p.monthlyPriceArs) }}</strong> a
          <strong>{{ ars(price()) }}</strong> por mes.
        </p>
      }
      @if (isTest()) {
        <p
          class="mt-2 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[14.5px] font-semibold text-accent-ink"
          data-testid="confirm-test-warning"
        >
          Es un precio de prueba. Mientras esté puesto, cualquiera que se suscriba paga
          {{ ars(price()) }}.
        </p>
      }
      <p class="mt-2 text-[15px] leading-6 text-muted">
        Lo van a ver y pagar quienes se suscriban desde ahora. Las suscripciones que ya existen no
        cambian de monto.
      </p>
      <div class="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          class="button-primary min-h-12 rounded-xl px-5 text-[16px] font-semibold disabled:opacity-60 sm:flex-1"
          [disabled]="store.saving()"
          (click)="confirm()"
          data-testid="confirm"
        >
          {{ store.saving() ? 'Guardando…' : 'Cambiar precio' }}
        </button>
        <button
          type="button"
          class="button-secondary min-h-12 rounded-xl px-5 text-[16px] font-semibold sm:flex-1"
          [disabled]="store.saving()"
          (click)="confirming.set(false)"
        >
          Cancelar
        </button>
      </div>
    </app-dialog>
  `,
})
export class AdminPricingPage implements OnInit {
  protected readonly store = inject(AdminPricingStore);
  protected readonly limits = PRO_PRICE_LIMITS;
  protected readonly ars = formatARS;
  protected readonly testBelow = PRO_PRICE_TEST_BELOW;

  /** Monto escrito (0 = vacío). */
  protected readonly price = signal(0);
  protected readonly touched = signal(false);
  protected readonly confirming = signal(false);
  protected readonly saved = signal(false);

  /** Precio de prueba: válido, pero se avisa que cualquier profesional que se suscriba lo paga. */
  protected readonly isTest = computed(() => this.valid() && this.price() < this.testBelow);
  protected readonly shown = computed(() => formatThousands(this.price()));
  protected readonly valid = computed(
    () => this.price() >= this.limits.min && this.price() <= this.limits.max,
  );
  /** Vista previa de la oferta de bienvenida; el valor que vale lo calcula el servidor. */
  protected readonly promoPreview = computed(() => {
    const offer = this.store.pricing()?.introOffer;
    return offer && this.valid()
      ? Math.round((this.price() * (100 - offer.discountPercent)) / 100)
      : null;
  });

  ngOnInit(): void {
    void this.store.load();
  }

  protected when(value: string): string {
    return formatTimestamp(value);
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.price.set(onlyDigits(input.value, 8));
    input.value = this.shown();
    this.saved.set(false);
  }

  protected askConfirm(): void {
    this.touched.set(true);
    if (!this.valid()) return;
    this.confirming.set(true);
  }

  protected async confirm(): Promise<void> {
    const ok = await this.store.save(this.price());
    this.confirming.set(false);
    if (ok) {
      this.price.set(0);
      this.touched.set(false);
    }
    this.saved.set(ok);
  }
}
