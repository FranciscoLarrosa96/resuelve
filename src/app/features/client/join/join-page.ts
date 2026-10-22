import { PlanOptions } from '../../../shared/components/plan-options/plan-options';
import { PlanUseCases } from '../../../shared/components/plan-options/plan-use-cases';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProAnalyticsApiService } from '../../../core/api/pro-analytics-api.service';
import { PlansInfo } from '../../../core/models/pro-analytics';
import { AuthStore } from '../../../core/state/auth.store';
import { formatMoney } from '../../../core/utils/format';
import { Icon, IconName } from '../../../shared/components/icon/icon';

interface Tool {
  icon: IconName;
  title: string;
  text: string;
}

/**
 * "Trabajá con Resuelve": la página para profesionales ANTES de crear la cuenta.
 * Solo lo que el producto hace hoy (sin testimonios, cifras ni promesas de
 * clientes o ingresos). El precio y el cupo Free salen de GET /plans (única
 * fuente); sin respuesta, la página no inventa un número.
 */
@Component({
  selector: 'app-join-page',
  imports: [RouterLink, Icon, PlanOptions, PlanUseCases],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-6xl px-4 pt-8 pb-20 md:px-8 md:pt-14">
      <section class="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center" aria-labelledby="join-title">
        <div>
          <p class="text-sm font-semibold tracking-[0.14em] text-brand uppercase">Para profesionales y oficios</p>
          <h1 id="join-title" class="mt-3 font-display text-[40px] leading-[1.05] font-bold tracking-[-0.02em] text-balance text-ink md:text-[56px]">
            Que los vecinos de tu zona te encuentren.
          </h1>
          <p class="mt-5 max-w-xl text-[18px] leading-relaxed text-ink-soft">
            Armá tu perfil gratis y facilitá que los clientes de tu zona te contacten por WhatsApp, llamadas o solicitudes por Resuelve. Con PRO, publicá también tus trabajos con fotos.
            El trabajo lo cobrás vos, directo con el cliente.
          </p>
          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <a [routerLink]="startLink()" class="button-primary inline-flex min-h-13 items-center justify-center gap-2 rounded-xl px-7 text-[16px] font-semibold" data-testid="join-cta">
              Crear mi perfil gratis<app-icon name="arrow-right" [size]="16" [stroke]="2.4" />
            </a>
            <a routerLink="/trabaja-con-resuelve" fragment="como-funciona" class="inline-flex min-h-13 items-center justify-center rounded-xl px-5 text-[16px] font-semibold text-brand hover:bg-brand-tint">
              Cómo funciona
            </a>
          </div>
          @if (!auth.authenticated()) {
            <p class="mt-4 text-[14px] text-muted">
              ¿Ya tenés cuenta? <a routerLink="/ingresar" [queryParams]="{ returnUrl: '/soy-profesional' }" class="font-semibold text-brand underline underline-offset-2">Ingresá</a> y sumá tu perfil profesional.
            </p>
          }
        </div>

        <!-- Lo que ve un cliente: una tarjeta ilustrativa, rotulada como ejemplo (no es un profesional real). -->
        <figure class="rounded-3xl border border-line bg-surface p-6 shadow-soft" aria-label="Ejemplo de perfil profesional">
          <span class="inline-flex rounded-full bg-sand px-2.5 py-0.5 text-[12.5px] font-semibold text-ink-soft">Ejemplo</span>
          <div class="mt-4 flex items-start gap-4">
            <span class="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand-tint font-display text-[24px] font-bold text-brand" aria-hidden="true">TU</span>
            <div class="min-w-0">
              <p class="font-display text-[22px] leading-tight font-bold">Tu nombre</p>
              <p class="text-[15px] text-ink-soft">Tu oficio · tus años de experiencia</p>
              <p class="mt-1 inline-flex items-center gap-1 text-[14px] text-muted"><app-icon name="pin" [size]="13" />Las localidades donde trabajás</p>
            </div>
          </div>
          <ul class="mt-5 grid gap-2.5 text-[15px]">
            <li class="flex items-center gap-2.5"><app-icon name="camera" [size]="16" class="text-brand" />Trabajos con fotos, con acceso PRO</li>
            <li class="flex items-center gap-2.5"><app-icon name="star" [size]="16" class="text-brand" />Las reseñas de tus clientes, con tu respuesta</li>
            <li class="flex items-center gap-2.5"><app-icon name="chat" [size]="16" class="text-brand" />WhatsApp y llamadas, si los habilitás</li>
            <li class="flex items-center gap-2.5"><app-icon name="document" [size]="16" class="text-brand" />Pedidos de presupuesto por Resuelve</li>
          </ul>
          <figcaption class="mt-5 border-t border-line-soft pt-3 text-[13.5px] text-muted">Así se arma tu perfil público: lo completás vos y lo cambiás cuando quieras.</figcaption>
        </figure>
      </section>

      <section id="como-funciona" class="mt-20 scroll-mt-24" aria-labelledby="how-title">
        <h2 id="how-title" class="font-display text-[32px] leading-tight font-bold tracking-[-0.02em] md:text-[40px]">Cómo funciona</h2>
        <ol class="mt-8 grid gap-8 md:grid-cols-3">
          @for (step of steps; track step.title; let i = $index) {
            <li class="border-t-2 border-ink pt-4">
              <p class="font-display text-[28px] font-bold text-brand tabular-nums">{{ i + 1 }}</p>
              <h3 class="mt-1 text-[18px] font-bold">{{ step.title }}</h3>
              <p class="mt-1.5 text-[15.5px] leading-relaxed text-ink-soft">{{ step.text }}</p>
            </li>
          }
        </ol>
      </section>

      <section class="mt-20" aria-labelledby="tools-title">
        <h2 id="tools-title" class="font-display text-[32px] leading-tight font-bold tracking-[-0.02em] md:text-[40px]">Tus herramientas, en un solo lugar</h2>
        <p class="mt-3 max-w-2xl text-[16px] text-ink-soft">Todo esto viene con tu perfil, en Free y en PRO.</p>
        <ul class="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          @for (t of tools; track t.title) {
            <li class="flex gap-3.5">
              <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand" aria-hidden="true"><app-icon [name]="t.icon" [size]="18" /></span>
              <div>
                <h3 class="text-[16px] font-bold">{{ t.title }}</h3>
                <p class="mt-0.5 text-[15px] leading-snug text-ink-soft">{{ t.text }}</p>
              </div>
            </li>
          }
        </ul>
      </section>

      <section class="mt-20" aria-labelledby="plans-title" data-testid="join-plans">
        <app-plan-use-cases class="mb-8 block" />
        <h2 id="plans-title" class="font-display text-[32px] leading-tight font-bold tracking-[-0.02em] md:text-[40px]">Empezá gratis</h2>
        <app-plan-options class="mt-8 block" [info]="plans()" />
      </section>

      <section class="mt-20 max-w-3xl" aria-labelledby="faq-title">
        <h2 id="faq-title" class="font-display text-[32px] leading-tight font-bold tracking-[-0.02em] md:text-[40px]">Preguntas frecuentes</h2>
        <div class="mt-6 divide-y divide-line border-y border-line">
          @for (q of faq(); track q.q) {
            <details class="group py-1">
              <summary class="flex min-h-14 cursor-pointer items-center justify-between gap-4 text-[17px] font-semibold">
                {{ q.q }}<app-icon name="chevron-down" [size]="18" class="shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p class="pb-4 text-[15.5px] leading-relaxed text-ink-soft">{{ q.a }}</p>
            </details>
          }
        </div>
      </section>

      <section class="mt-20 rounded-3xl bg-primary px-6 py-10 text-on-primary md:px-12 md:py-14" aria-labelledby="join-final-title">
        <h2 id="join-final-title" class="font-display text-[30px] leading-tight font-bold md:text-[40px]">Tu perfil, listo en unos minutos.</h2>
        <p class="mt-3 max-w-xl text-[17px] opacity-90">Elegís tus servicios y dónde trabajás. Sumás tu foto de perfil gratis; para publicar trabajos con fotos, elegís PRO.</p>
        <a [routerLink]="startLink()" class="mt-7 inline-flex min-h-13 items-center gap-2 rounded-xl bg-surface px-7 text-[16px] font-semibold text-brand-dark hover:bg-canvas">
          Crear mi perfil gratis<app-icon name="arrow-right" [size]="16" [stroke]="2.4" />
        </a>
      </section>
    </div>
  `,
})
export class JoinPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ProAnalyticsApiService);
  protected readonly plans = signal<PlansInfo | null>(null);
  protected readonly price = computed(() => {
    const p = this.plans()?.pro.monthlyPriceArs;
    return p ? formatMoney(p) : null;
  });
  /** Invitado: crear cuenta para profesionales. Con sesión: el alta directo. */
  protected readonly startLink = computed(() => (this.auth.authenticated() ? '/soy-profesional' : '/registro/profesional'));

  protected readonly steps = [
    { title: 'Armás tu perfil', text: 'Elegís qué servicios ofrecés y en qué localidades trabajás: toda la ciudad o algunos barrios.' },
    { title: 'Te encuentran', text: 'Aparecés cuando buscan en tu zona. Te piden presupuesto por Resuelve o, si lo habilitás, te escriben por WhatsApp o te llaman.' },
    { title: 'Presupuestás y coordinás', text: 'Respondés con un presupuesto claro, coordinás el horario en tu agenda y, al terminar, sumás la reseña del cliente.' },
  ];

  protected readonly tools: Tool[] = [
    { icon: 'agenda', title: 'Agenda de trabajos', text: 'Proponés el horario, el cliente lo confirma y queda en tu agenda.' },
    { icon: 'document', title: 'Plantillas de presupuesto', text: 'Guardá los trabajos que repetís y completá un presupuesto en un toque.' },
    { icon: 'chat', title: 'Consultas antes de presupuestar', text: 'Preguntale al cliente lo que necesitás saber antes de mandar tu precio.' },
    { icon: 'mic', title: 'Dictado por voz', text: 'Escribí el presupuesto hablando, en los navegadores que lo permiten.' },
    { icon: 'star', title: 'Reseñas con respuesta', text: 'Pedí reseñas a tus clientes de siempre con un enlace o QR y respondelas en público.' },
    { icon: 'chart', title: 'Tu mes', text: 'Cuántas solicitudes recibiste, cuántas respondiste y cuántos clientes te eligieron.' },
  ];

  /** El cupo y el precio salen de GET /plans: el cupo de Free se dice antes de crear la cuenta, no al agotarlo. */
  protected readonly faq = computed(() => [{ q: '¿Cuánto cuesta?', a: this.costAnswer() }, ...this.otherFaq]);

  protected readonly costAnswer = computed(() => {
    const limit = this.plans()?.free.quoteLimit;
    const price = this.price();
    const free =
      limit == null
        ? 'Crear tu perfil y usar Resuelve Free es gratis.'
        : `Crear tu perfil y usar Resuelve Free es gratis: te llegan solicitudes y te contactan por WhatsApp o llamadas. Con presupuesto podés responder ${limit === 1 ? '1 pedido' : `${limit} pedidos`} de búsqueda en total: no se renueva cada mes, y los pedidos que te hacen a vos directamente no cuentan.`;
    const pro = price
      ? `PRO es opcional: ${price} por mes, respondés sin ese límite y lo cancelás cuando quieras.`
      : 'PRO es opcional: se paga por mes, respondés sin ese límite y lo cancelás cuando quieras.';
    return `${free} ${pro}`;
  });

  private readonly otherFaq = [
    { q: '¿Resuelve cobra el trabajo o se queda con una parte?', a: 'No. Acordás el precio y lo cobrás vos, directo con el cliente. Resuelve no interviene en ese pago.' },
    { q: '¿Necesito matrícula?', a: 'No para aparecer. En los servicios que la piden podés cargar tu número de matrícula: si la verificamos en el registro oficial, tu perfil muestra «Matrícula verificada».' },
    { q: '¿Se publica mi teléfono?', a: 'Solo si habilitás WhatsApp o llamadas y das tu consentimiento. Si no, el cliente ve tus datos recién cuando elige tu presupuesto.' },
    { q: '¿Puedo pausar mi perfil?', a: 'Sí. Lo pausás desde Mi perfil y no aparecés en búsquedas nuevas hasta que lo reactives.' },
  ];

  constructor() {
    // Precio y cupo reales: solo en el navegador (el HTML prerenderizado no fija un número).
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.api.getPlans().subscribe({ next: (p) => this.plans.set(p), error: () => this.plans.set(null) });
  }
}
