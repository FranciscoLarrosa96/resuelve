import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ProStore } from '../../../core/state/pro.store';
import { Dialog } from '../../../shared/components/dialog/dialog';

/**
 * "Probar PRO gratis" (solo en Tu mes: la tarjeta del panel y la página). Aparece
 * únicamente si el backend dice que puede activarla (`proTrial.state === 'AVAILABLE'`:
 * Free después del primer cliente, nunca pagó PRO ni tuvo una prueba). Opt-in: el
 * botón abre una confirmación que dice qué incluye y que no se cobra nada; recién
 * "Empezar prueba" la activa. Sin timers ni urgencia inventada.
 */
@Component({
  selector: 'app-pro-trial-offer',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (days(); as d) {
      <div
        class="flex flex-col items-start gap-3"
        [class]="stacked() ? '' : 'sm:flex-row sm:items-center sm:justify-between'"
        data-testid="pro-trial-offer"
      >
        <p class="min-w-0 text-[14.5px] leading-6 text-ink-soft">
          <b class="text-ink">Probá Resuelve PRO {{ d }} días gratis.</b>
          Sin tarjeta y sin cobros: al terminar volvés a Free solo.
        </p>
        <button
          type="button"
          class="button-secondary h-10 shrink-0 rounded-xl px-4 text-[14px] font-semibold text-ink press"
          data-testid="pro-trial-open"
          (click)="open.set(true)"
        >
          Probar PRO gratis
        </button>
      </div>
      <app-dialog
        [open]="open()"
        labelledBy="pro-trial-title"
        describedBy="pro-trial-copy"
        [dismissable]="!store.startingTrial()"
        (dismiss)="open.set(false)"
      >
        <p class="text-sm font-semibold tracking-[0.12em] text-brand uppercase">Resuelve PRO</p>
        <h2
          id="pro-trial-title"
          class="mt-2 font-display text-[26px] leading-tight font-bold tracking-[-0.02em]"
        >
          ¿Empezar tu prueba de {{ d }} días?
        </h2>
        <div id="pro-trial-copy" class="mt-3 grid gap-2 text-[15px] leading-relaxed text-ink-soft">
          <p>
            Durante {{ d }} días tenés todo lo de PRO: tu perfil puede ocupar espacios Destacados, las
            solicitudes nuevas te llegan antes que a los perfiles Free, presupuestás sin el límite de
            Free y ves Tu mes completo.
          </p>
          <p>
            <b class="text-ink">Es gratis y sin tarjeta.</b> Al terminar volvés a Free solo, sin
            cobros. La prueba se usa una sola vez.
          </p>
          <p>Cuando termine, te mostramos lo que pasó en tu perfil durante esos días.</p>
        </div>
        <div class="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            class="button-primary flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold disabled:opacity-60 sm:flex-1"
            data-testid="pro-trial-start"
            [disabled]="store.startingTrial()"
            [attr.aria-busy]="store.startingTrial()"
            (click)="start()"
          >
            @if (store.startingTrial()) {
              <span
                class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white"
                aria-hidden="true"
              ></span>
            }
            Empezar prueba
          </button>
          <button
            type="button"
            class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand sm:flex-1"
            [disabled]="store.startingTrial()"
            (click)="open.set(false)"
          >
            Ahora no
          </button>
        </div>
      </app-dialog>
    }
  `,
})
export class ProTrialOffer {
  protected readonly store = inject(ProStore);
  /** Siempre en columna (la tarjeta angosta del panel). */
  readonly stacked = input(false);
  /** La prueba empezó: quien la contiene relee lo que depende del plan (p. ej. Tu mes). */
  readonly started = output<void>();

  protected readonly open = signal(false);
  protected readonly days = computed(() => {
    const t = this.store.proTrial();
    return t?.state === 'AVAILABLE' ? t.days : null;
  });

  protected async start(): Promise<void> {
    if (await this.store.startProTrial()) {
      this.open.set(false);
      this.started.emit();
    }
  }
}
