import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Ejemplos de uso, no resultados ni prestaciones nuevas. */
@Component({
  selector: 'app-plan-use-cases',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="border-y border-line py-5"
      aria-label="Qué plan te sirve"
      data-testid="plan-use-cases"
    >
      <p class="text-sm font-semibold tracking-wide text-muted uppercase">
        Elegí por lo que necesitás
      </p>
      <dl class="mt-4 grid gap-5 md:grid-cols-3">
        <div>
          <dt class="font-bold text-ink">Gratis · Tu lugar para empezar</dt>
          <dd class="mt-1 text-sm leading-6 text-ink-soft">
            Compartí tu perfil, recibí contactos por los canales que habilites y coordiná en tu
            agenda los trabajos acordados por Resuelve.
          </dd>
        </div>
        <div>
          <dt class="font-bold text-brand">PRO · Mostrá más de tu oficio</dt>
          <dd class="mt-1 text-sm leading-6 text-ink-soft">
            Reuní las fotos de distintos trabajos en tu perfil, participá en espacios Destacados
            cuando cumplís los requisitos y consultá el desglose del interés que recibe.
          </dd>
        </div>
        <div>
          <dt class="font-bold text-accent-ink">PRO Plus · Llevá tus herramientas al trabajo</dt>
          <dd class="mt-1 text-sm leading-6 text-ink-soft">
            Descargá el presupuesto que armaste en PDF para compartirlo, mostrale al cliente el
            antes y después de un trabajo y exportá Tu mes en CSV.
          </dd>
        </div>
      </dl>
      <p class="mt-4 text-xs leading-5 text-muted">
        Ejemplos de uso. WhatsApp y llamadas siguen siendo gratis; un plan pago no garantiza
        consultas ni trabajos.
      </p>
    </aside>
  `,
})
export class PlanUseCases {}
