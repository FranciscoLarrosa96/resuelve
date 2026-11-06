import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ContactFollowup, ContactFollowupsApiService } from '../../../core/api/contact-followups-api.service';
import { AuthStore } from '../../../core/state/auth.store';

/** Los tests unitarios no consultan las preguntas salvo que lo pidan (`test-setup.ts`). */
let offline = false;
export function setContactFollowupsOffline(value: boolean): void {
  offline = value;
}

/**
 * «¿Lo contrataste?»: unos días después de escribirle o llamar a un profesional (con la
 * sesión iniciada), se le pregunta al cliente. «Sí» lleva a dejar una reseña (se muestra
 * aparte como cliente invitado y no suma al puntaje); «No» la cierra. Una vez por
 * profesional. Sin preguntas pendientes no se muestra nada.
 */
@Component({
  selector: 'app-contact-followup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section class="grid gap-3" aria-label="¿Contrataste a alguien?" data-testid="contact-followups">
        @for (f of items(); track f.professionalId) {
          <article class="rounded-2xl border border-brand-line bg-brand-tint p-4" data-testid="contact-followup">
            <h2 class="text-[17px] font-bold text-ink">¿Contrataste a {{ firstName(f.name) }}?</h2>
            <p class="mt-1 text-[15px] leading-6 text-ink-soft">
              Hace unos días {{ f.channel === 'WHATSAPP' ? 'le escribiste por WhatsApp' : 'lo llamaste' }} a
              <b class="text-ink">{{ f.name }}</b>{{ f.headline ? ' (' + f.headline + ')' : '' }}.
              Si hizo el trabajo, tu opinión ayuda a otros vecinos.
            </p>
            <div class="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                class="button-primary min-h-12 rounded-xl px-5 text-[15px] font-semibold disabled:opacity-60"
                [disabled]="busy() === f.professionalId"
                (click)="answer(f, 'HIRED')"
              >
                Sí, dejar mi opinión
              </button>
              <button
                type="button"
                class="button-secondary min-h-12 rounded-xl px-5 text-[15px] font-semibold text-ink disabled:opacity-60"
                [disabled]="busy() === f.professionalId"
                (click)="answer(f, 'NOT_HIRED')"
              >
                No lo contraté
              </button>
            </div>
          </article>
        }
      </section>
    }
  `,
})
export class ContactFollowupCards {
  private readonly api = inject(ContactFollowupsApiService);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly items = signal<ContactFollowup[]>([]);
  protected readonly busy = signal<string | null>(null);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID)) || offline) return;
    effect(() => {
      if (!this.auth.authenticated()) {
        this.items.set([]);
        return;
      }
      untracked(() => this.load());
    });
  }

  private load(): void {
    this.api.list().subscribe({ next: (r) => this.items.set(r.items), error: () => this.items.set([]) });
  }

  protected firstName(name: string): string {
    return name.split(/\s+/)[0] ?? name;
  }

  protected async answer(f: ContactFollowup, answer: 'HIRED' | 'NOT_HIRED'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(f.professionalId);
    try {
      await firstValueFrom(this.api.answer(f.professionalId, answer));
    } catch {
      // Ya respondida en otra pestaña o sin conexión: igual se saca de la vista.
    } finally {
      this.busy.set(null);
      this.items.update((list) => list.filter((x) => x.professionalId !== f.professionalId));
    }
    if (answer === 'HIRED') void this.router.navigate(['/profesional', f.professionalId, 'resenar']);
  }
}
