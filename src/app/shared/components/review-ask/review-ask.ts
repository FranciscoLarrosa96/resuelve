import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { PublicLinks } from '../../../core/acquisition/public-links';
import { Icon } from '../icon/icon';

/**
 * "Pedile la reseña": trabajo realizado por Resuelve y todavía sin reseña. El enlace lleva
 * al cliente a la reseña DE ESE TRABAJO (la que suma al puntaje), no al QR de invitados
 * (`ReviewInvite`, para trabajos por fuera de Resuelve). Lo muestra quien decide el backend
 * (`clientReviewed === false`); al llegar la reseña desaparece.
 */
@Component({
  selector: 'app-review-ask',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="animate-fade-in rounded-2xl border border-brand-line bg-brand-tint p-4.5 sm:p-5"
      aria-labelledby="review-ask-title"
      data-testid="review-ask"
    >
      <div class="flex items-start gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-brand"
          aria-hidden="true"
          ><app-icon name="star" [size]="20"
        /></span>
        <div class="min-w-0">
          <h2
            id="review-ask-title"
            class="font-sans text-[19px] leading-tight font-bold text-brand-dark sm:text-[21px]"
          >
            Pedile la reseña a {{ name() }}
          </h2>
          <p class="mt-1.5 text-[15px] leading-[1.45] text-ink-soft">
            Es el mejor momento: el trabajo está fresco. Su reseña suma a tu puntaje y te ayuda a
            conseguir más clientes en Resuelve.
          </p>
        </div>
      </div>
      <div class="mt-4 grid gap-2 sm:flex">
        <a
          [href]="whatsapp()"
          target="_blank"
          rel="noopener noreferrer"
          class="button-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15.5px] font-semibold"
          data-testid="review-ask-whatsapp"
        >
          <app-icon name="message" [size]="18" aria-hidden="true" />
          Enviar por WhatsApp
        </a>
        <button
          type="button"
          class="button-secondary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface px-5 text-[15.5px] font-semibold"
          (click)="copy()"
        >
          <app-icon [name]="copied() ? 'check' : 'copy'" [size]="18" aria-hidden="true" />
          {{ copied() ? 'Copiado' : 'Copiar enlace' }}
        </button>
      </div>
      <p class="sr-only" role="status">{{ copied() ? 'Enlace copiado.' : '' }}</p>
      @if (copyFailed()) {
        <p class="mt-3 text-[14px] text-ink-soft" role="alert">
          No pudimos copiarlo. Mantené apretado el enlace para copiarlo:
          <span class="mt-1 block font-mono text-[13.5px] break-all select-all">{{ url() }}</span>
        </p>
      }
      <p class="mt-3 text-[14px] leading-[1.45] text-muted">
        El enlace le abre a {{ name() }} la reseña de este trabajo.
      </p>
    </section>
  `,
})
export class ReviewAsk {
  readonly requestId = input.required<string>();
  readonly clientFirstName = input<string | null | undefined>(null);
  private readonly links = inject(PublicLinks);

  protected readonly name = computed(() => this.clientFirstName()?.trim() || 'tu cliente');
  protected readonly url = computed(() => this.links.jobReview(this.requestId()));
  protected readonly whatsapp = computed(() => {
    const hi = this.clientFirstName()?.trim() ? `¡Hola, ${this.name()}!` : '¡Hola!';
    return (
      'https://wa.me/?text=' +
      encodeURIComponent(
        `${hi} Gracias por confiar en mí. ¿Me dejás una reseña en Resuelve? Me ayuda mucho a conseguir más trabajos:\n${this.url()}`,
      )
    );
  });
  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copyFailed.set(false);
      this.copied.set(true);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.copied.set(false), 2500);
    } catch {
      this.copyFailed.set(true);
    }
  }
}
