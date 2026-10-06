import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProfessionalsApiService } from '../../../core/api/professionals-api.service';
import { avatarOf } from '../../../core/models/avatar';
import { InvitedReviewBlocker, InvitedReviewStatus } from '../../../core/models/professional';
import { REVIEW_COMMENT_MAX } from '../../../core/models/request';
import { AuthStore } from '../../../core/state/auth.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';
import { StarInput, Stars } from '../../../shared/components/stars/stars';

/** Revisión liviana: el servidor valida de verdad. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mismo criterio que el backend (NO_HTML): nada con forma de etiqueta. "<3" pasa. */
const LOOKS_LIKE_HTML = /<\s*[/!]?\s*[a-z]/i;

type Phase = 'loading' | 'form' | 'sent' | 'blocked' | 'error' | 'not-found';

/**
 * Reseña de alguien que NO contrató por Resuelve: llega por el QR o el enlace que le pasó el
 * profesional. Pensada para el celular y para cualquier edad: una sola pantalla, estrellas grandes,
 * comentario opcional y un botón. NO hace falta cuenta: sin sesión se piden solo el nombre de pila y un
 * correo (privado; evita reseñas repetidas). Con sesión no se pide nada más.
 * La reseña queda rotulada "Cliente invitado por el profesional" y no mueve el rating.
 */
@Component({
  selector: 'app-invited-review-page',
  imports: [FormsModule, RouterLink, Avatar, Icon, Stars, StarInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex min-h-[70vh] max-w-md animate-fade-in flex-col px-5 pt-6 pb-16 sm:pt-12">
      @switch (phase()) {
        @case ('loading') {
          <p class="m-auto text-[15px] text-muted" role="status">Cargando…</p>
        }
        @case ('not-found') {
          <div class="m-auto text-center">
            <h1 class="font-display text-2xl font-bold tracking-[-0.02em]">No encontramos este perfil</h1>
            <p class="mt-2 text-[15px] text-muted">
              Puede que el enlace esté incompleto o que el profesional ya no esté disponible.
            </p>
            <a routerLink="/" class="button-primary mt-6 inline-flex min-h-12 items-center rounded-xl px-6 text-[16px] font-semibold"
              >Ir al inicio</a
            >
          </div>
        }
        @case ('error') {
          <div class="m-auto text-center" role="alert">
            <h1 class="font-display text-2xl font-bold tracking-[-0.02em]">No pudimos cargar la pantalla</h1>
            <p class="mt-2 text-[15px] text-muted">Revisá tu conexión y probá de nuevo.</p>
            <button
              type="button"
              class="button-primary mt-6 min-h-12 rounded-xl px-6 text-[16px] font-semibold"
              (click)="reload()"
            >
              Reintentar
            </button>
          </div>
        }
        @default {
          @if (pro(); as p) {
            <header class="flex flex-col items-center text-center">
              <app-avatar [subject]="avatar()!" alt="" class="size-20 rounded-full text-2xl" />
              @if (phase() === 'form') {
                <h1 class="mt-4 font-display text-[28px] leading-tight font-bold tracking-[-0.02em] text-balance">
                  ¿Cómo te fue con {{ p.firstName }}?
                </h1>
              } @else if (phase() === 'sent') {
                <app-icon name="check-circle" [size]="40" class="mt-5 animate-pop text-brand" aria-hidden="true" />
                <h1
                  id="invited-sent-title"
                  tabindex="-1"
                  class="mt-3 font-display text-[28px] leading-tight font-bold tracking-[-0.02em] outline-none"
                >
                  ¡Gracias{{ firstName() ? ', ' + firstName() : '' }}!
                </h1>
              } @else {
                <h1 class="mt-4 font-display text-[26px] leading-tight font-bold tracking-[-0.02em] text-balance">
                  {{ p.displayName }}
                </h1>
              }
              <p class="mt-1 text-[15px] text-muted">{{ p.headline || p.services[0]?.name }}</p>
            </header>

            @switch (phase()) {
              @case ('form') {
                <form class="mt-7" novalidate (ngSubmit)="submit()">
                  <app-star-input
                    [(value)]="rating"
                    name="invited-rating"
                    legend="Puntaje"
                    [large]="true"
                    [disabled]="sending()"
                  />
                  @if (!rating()) {
                    <p class="mt-2 text-center text-[15px] text-muted">Tocá una estrella para puntuar.</p>
                  } @else {
                    <p class="mt-2 text-center text-[15px] font-semibold text-ink tabular-nums" aria-live="polite">
                      {{ rating() }} de 5
                    </p>
                  }

                  @if (rating()) {
                    <div class="mt-6 animate-fade-in">
                      <label for="invited-comment" class="block text-[16px] font-semibold text-ink">
                        Contanos cómo fue <span class="font-normal text-muted">(opcional)</span>
                      </label>
                      <textarea
                        id="invited-comment"
                        name="comment"
                        rows="4"
                        [maxlength]="max"
                        [(ngModel)]="comment"
                        [disabled]="sending()"
                        [attr.aria-invalid]="commentError() ? 'true' : null"
                        aria-describedby="invited-comment-hint"
                        placeholder="Por ejemplo: llegó a horario y dejó todo limpio."
                        class="mt-2 w-full min-w-0 resize-y rounded-xl field-control px-4 py-3 text-[16px] text-ink aria-invalid:border-danger"
                      ></textarea>
                      <div id="invited-comment-hint" class="mt-1 flex justify-between gap-3 text-[14px] text-muted">
                        <span [class.text-danger]="commentError()">{{
                          commentError() ? 'Escribí solo texto, sin etiquetas HTML.' : ''
                        }}</span>
                        <span class="tabular-nums">{{ comment().length }}/{{ max }}</span>
                      </div>
                      @if (guest()) {
                        <div class="mt-5 grid gap-4">
                          <div>
                            <label for="invited-name" class="block text-[16px] font-semibold text-ink">Tu nombre</label>
                            <input
                              id="invited-name"
                              name="name"
                              autocomplete="given-name"
                              maxlength="60"
                              [ngModel]="name()"
                              (ngModelChange)="name.set($event); nameError.set(false)"
                              [disabled]="sending()"
                              [attr.aria-invalid]="nameError() ? 'true' : null"
                              [attr.aria-describedby]="nameError() ? 'invited-name-error' : null"
                              class="mt-2 h-12 w-full min-w-0 rounded-xl field-control px-4 text-[16px] text-ink aria-invalid:border-danger"
                            />
                            @if (nameError()) {
                              <p id="invited-name-error" class="mt-1.5 text-[14px] font-medium text-danger">Escribí tu nombre.</p>
                            }
                          </div>
                          <div>
                            <label for="invited-email" class="block text-[16px] font-semibold text-ink">Tu correo</label>
                            <input
                              id="invited-email"
                              name="email"
                              type="email"
                              autocomplete="email"
                              inputmode="email"
                              maxlength="254"
                              [ngModel]="email()"
                              (ngModelChange)="email.set($event); emailError.set(false)"
                              [disabled]="sending()"
                              [attr.aria-invalid]="emailError() ? 'true' : null"
                              aria-describedby="invited-email-hint"
                              class="mt-2 h-12 w-full min-w-0 rounded-xl field-control px-4 text-[16px] text-ink aria-invalid:border-danger"
                            />
                            <p
                              id="invited-email-hint"
                              class="mt-1.5 text-[14px]"
                              [class]="emailError() ? 'font-medium text-danger' : 'text-muted'"
                            >
                              {{
                                emailError()
                                  ? 'Revisá el correo: tiene que ser algo como nombre@correo.com.'
                                  : 'No se muestra a nadie. Lo usamos solo para evitar reseñas repetidas.'
                              }}
                            </p>
                          </div>
                        </div>
                      }
                      <button
                        type="submit"
                        class="button-primary mt-6 min-h-14 w-full rounded-xl px-6 text-[17px] font-semibold disabled:opacity-60"
                        [disabled]="sending()"
                        data-testid="invited-submit"
                      >
                        {{ sending() ? 'Enviando…' : 'Enviar reseña' }}
                      </button>
                    </div>
                  }

                  @if (error(); as err) {
                    <p
                      class="mt-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger"
                      role="alert"
                    >
                      {{ err }}
                    </p>
                  }

                  <p class="mt-4 text-center text-[14px] leading-[1.45] text-muted">
                    Se verá en el perfil de {{ p.firstName }} con tu nombre de pila, marcada como «Cliente invitado
                    por el profesional».
                  </p>
                </form>
              }
              @case ('sent') {
                <section class="mt-6 text-center" aria-labelledby="invited-sent-title">
                  <app-stars [rating]="rating() ?? 0" [size]="22" />
                  <p class="mt-3 text-[16px] text-ink-soft">
                    Tu reseña ya está en el perfil de {{ p.firstName }}.
                  </p>
                  <div class="mt-7 flex flex-col gap-2.5">
                    <a
                      [routerLink]="profileLink()"
                      class="button-primary inline-flex min-h-14 items-center justify-center rounded-xl px-6 text-[17px] font-semibold"
                      >Ver el perfil</a
                    >
                    <a
                      routerLink="/"
                      class="button-secondary inline-flex min-h-12 items-center justify-center rounded-xl px-6 text-[16px] font-semibold text-ink"
                      >Pedir un presupuesto</a
                    >
                  </div>
                </section>
              }
              @case ('blocked') {
                <section class="mt-7 text-center" aria-labelledby="invited-blocked-title">
                  <h2 id="invited-blocked-title" class="text-[19px] font-semibold text-ink">
                    {{ blockedTitle() }}
                  </h2>
                  @if (status()?.review; as rv) {
                    <app-stars class="mt-3" [rating]="rv.rating" [size]="20" />
                    @if (rv.comment) {
                      <p class="mt-2 text-[15px] leading-normal break-words text-ink-soft">“{{ rv.comment }}”</p>
                    }
                  }
                  <p class="mt-2 text-[15px] text-muted">{{ blockedText() }}</p>
                  <div class="mt-7 flex flex-col gap-2.5">
                    @if (status()?.blocker === 'USE_JOB_REVIEW' && status()?.requestId; as requestId) {
                      <a
                        [routerLink]="['/mis-solicitudes', requestId]"
                        fragment="resena"
                        class="button-primary inline-flex min-h-14 items-center justify-center rounded-xl px-6 text-[17px] font-semibold"
                        >Reseñar desde mi trabajo</a
                      >
                    }
                    <a
                      [routerLink]="profileLink()"
                      class="button-secondary inline-flex min-h-12 items-center justify-center rounded-xl px-6 text-[16px] font-semibold text-ink"
                      >Ver el perfil</a
                    >
                  </div>
                </section>
              }
            }
          }
        }
      }
    </div>
  `,
})
export class InvitedReviewPage {
  private readonly api = inject(ProfessionalsApiService);
  private readonly auth = inject(AuthStore);
  private readonly pros = inject(ProfessionalsStore);

  /** Parámetros de ruta: `/p/:slug/resenar` o `/profesional/:id/resenar`. */
  readonly slug = input('');
  readonly id = input('');

  protected readonly max = REVIEW_COMMENT_MAX;
  protected readonly rating = signal<number | null>(null);
  protected readonly comment = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal<InvitedReviewStatus | null>(null);
  private readonly sent = signal(false);
  private readonly statusError = signal(false);

  protected readonly pro = computed(() => {
    const p = this.pros.selected();
    return p && (this.slug() ? p.slug === this.slug() : p.id === this.id()) ? p : null;
  });
  protected readonly avatar = computed(() => {
    const p = this.pro();
    return p ? avatarOf(p) : null;
  });
  protected readonly guest = computed(() => !this.auth.authenticated());
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly nameError = signal(false);
  protected readonly emailError = signal(false);
  /** Quien reseñó, para el agradecimiento. */
  protected readonly firstName = computed(() => this.auth.user()?.firstName ?? this.name().trim().split(/\s+/)[0] ?? '');
  protected readonly profileLink = computed(() => {
    const p = this.pro();
    return p?.slug ? ['/p', p.slug] : ['/profesional', p?.id ?? this.id()];
  });
  protected readonly commentError = computed(() => LOOKS_LIKE_HTML.test(this.comment()));

  protected readonly phase = computed<Phase>(() => {
    if (this.pros.detailError() === 'not-found') return 'not-found';
    if (this.pros.detailError() || this.statusError()) return 'error';
    if (!this.pro() || this.auth.initializing()) return 'loading';
    if (this.sent()) return 'sent';
    // Con cuenta se sabe de antemano si puede reseñar; sin cuenta, el servidor lo dice al enviar.
    if (this.auth.authenticated() && !this.status()) return 'loading';
    return this.status() && !this.status()!.canReview ? 'blocked' : 'form';
  });

  protected readonly blockedTitle = computed(() => {
    const first = this.pro()?.firstName ?? 'el profesional';
    const titles: Record<InvitedReviewBlocker, string> = {
      OWN_PROFILE: 'Este es tu perfil',
      ALREADY_REVIEWED: 'Ya dejaste tu reseña',
      USE_JOB_REVIEW: `Contrataste a ${first} por Resuelve`,
      LIMIT_REACHED: 'Por ahora no se pueden sumar más reseñas',
    };
    return titles[this.status()?.blocker ?? 'ALREADY_REVIEWED'];
  });
  protected readonly blockedText = computed(() => {
    const first = this.pro()?.firstName ?? 'el profesional';
    const texts: Record<InvitedReviewBlocker, string> = {
      OWN_PROFILE: 'Pasales este enlace a tus clientes para que te dejen su reseña.',
      ALREADY_REVIEWED: `¡Gracias por contarle a otros cómo te fue con ${first}!`,
      USE_JOB_REVIEW: 'Dejá tu reseña desde ese trabajo: así queda verificada y vale más.',
      LIMIT_REACHED: `${first} ya recibió muchas reseñas por invitación este mes. Probá más adelante.`,
    };
    return texts[this.status()?.blocker ?? 'ALREADY_REVIEWED'];
  });

  constructor() {
    effect(() => {
      const slug = this.slug();
      const id = slug || this.id();
      if (id) untracked(() => this.pros.loadDetail(id, false, !!slug));
    });
    // Con el perfil cargado: ¿puede reseñar? (así no completa un formulario que después falla).
    effect(() => {
      const id = this.pro()?.id;
      if (id && this.auth.authenticated()) untracked(() => this.loadStatus(id));
    });
  }

  protected reload(): void {
    this.statusError.set(false);
    const slug = this.slug();
    this.pros.loadDetail(slug || this.id(), true, !!slug);
    const id = this.pro()?.id;
    if (id) this.loadStatus(id);
  }

  private loadStatus(id: string): void {
    this.statusError.set(false);
    this.api.getInvitedReviewStatus(id).subscribe({
      next: (s) => this.status.set(s),
      error: () => this.statusError.set(true),
    });
  }

  protected submit(): void {
    const p = this.pro();
    const rating = this.rating();
    if (!p || !rating || this.sending() || this.commentError()) return;
    const guest = this.guest();
    const name = this.name().trim();
    const email = this.email().trim();
    if (guest) {
      this.nameError.set(!name);
      this.emailError.set(!EMAIL.test(email));
      if (this.nameError() || this.emailError()) return;
    }
    this.error.set(null);
    this.sending.set(true);
    const comment = this.comment().trim();
    const body = { rating, ...(comment ? { comment } : {}) };
    const request = guest
      ? this.api.createGuestReview(p.id, { ...body, name, email })
      : this.api.createInvitedReview(p.id, body);
    request.subscribe({
      next: () => {
        this.sending.set(false);
        this.sent.set(true);
        // El foco al título: quien usa lector de pantalla se entera de que se envió.
        setTimeout(() => document.getElementById('invited-sent-title')?.focus(), 0);
      },
      error: (err: unknown) => {
        this.sending.set(false);
        if (err instanceof HttpErrorResponse && err.status === 409) {
          // Ya reseñó, es su propio perfil, o contrató por Resuelve: se muestra el motivo real.
          const details = (err.error?.details ?? {}) as { blocker?: InvitedReviewBlocker; requestId?: string };
          this.status.set({
            canReview: false,
            blocker: details.blocker ?? 'ALREADY_REVIEWED',
            requestId: details.requestId ?? null,
            review: null,
          });
          if (!guest) this.loadStatus(p.id);
          return;
        }
        this.error.set('No pudimos enviar tu reseña. Probá de nuevo en un momento.');
      },
    });
  }
}
