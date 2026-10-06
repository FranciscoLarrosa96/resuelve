import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminReport, AdminReportView, HIDE_REASON_LIMITS } from '../../../core/models/admin';
import { AdminReportsStore } from '../../../core/state/admin-reports.store';
import { formatTimestamp } from '../../../core/utils/dates';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Logo } from '../../../shared/components/logo/logo';
import { Stars } from '../../../shared/components/stars/stars';

const REASONS: Record<AdminReport['reason'], string> = {
  FAKE: 'Falsa o de alguien que no trabajó',
  OFFENSIVE: 'Ofensiva o con datos personales',
  SPAM: 'Publicidad o spam',
  OTHER: 'Otro motivo',
};

/**
 * Panel de reportes de reseñas (solo admin). Misma lógica que `npm run reviews:moderation`:
 * ocultar no borra (la reseña deja de verse y de contar, conserva el lugar y se puede restaurar).
 */
@Component({
  selector: 'app-admin-reports-page',
  imports: [FormsModule, RouterLink, Dialog, Logo, Stars],
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
            aria-current="page"
            class="rounded-lg bg-sand px-2.5 py-2 text-[14px] sm:px-3 font-semibold text-ink"
            >Reportes</a
          >
          <a
            routerLink="/admin/precio"
            class="rounded-lg px-2.5 py-2 text-[14px] sm:px-3 font-semibold text-ink-soft hover:bg-sand"
            >Precio</a
          >
        </nav>
      </div>
    </header>

    <main id="main" class="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <h1
        class="font-display text-[30px] leading-tight font-bold tracking-[-0.02em] sm:text-[34px]"
      >
        Reportes de reseñas
      </h1>
      <p class="mt-1.5 text-[15px] text-ink-soft" aria-live="polite">
        @if (store.openCount() === null) {
          &nbsp;
        } @else if (store.openCount() === 0) {
          No hay reportes para revisar.
        } @else {
          Hay
          <strong class="font-semibold text-ink"
            >{{ store.openCount() }} {{ store.openCount() === 1 ? 'reporte' : 'reportes' }}</strong
          >
          para revisar.
        }
      </p>

      <nav class="mt-6 flex max-w-sm gap-1 rounded-xl bg-sand p-1" aria-label="Vistas">
        <a
          routerLink="/admin/reportes"
          [attr.aria-current]="view() === 'open' ? 'page' : null"
          class="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[14px] font-semibold"
          [class]="
            view() === 'open'
              ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(28,33,30,0.08)]'
              : 'text-ink-soft hover:text-ink'
          "
        >
          Para revisar
          @if (store.openCount()) {
            <span
              class="rounded-full bg-accent-soft px-1.5 text-[12px] tabular-nums text-accent-ink"
              >{{ store.openCount() }}</span
            >
          }
        </a>
        <a
          routerLink="/admin/reportes"
          [queryParams]="{ vista: 'resueltos' }"
          [attr.aria-current]="view() === 'resolved' ? 'page' : null"
          class="flex h-10 flex-1 items-center justify-center rounded-lg text-[14px] font-semibold"
          [class]="
            view() === 'resolved'
              ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(28,33,30,0.08)]'
              : 'text-ink-soft hover:text-ink'
          "
        >
          Resueltos
        </a>
      </nav>

      @if (store.actionError()) {
        <p
          class="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger"
          role="alert"
        >
          {{ store.actionError() }}
        </p>
      }

      @switch (store.state()) {
        @case ('error') {
          <div class="mt-5 rounded-2xl border border-line bg-surface p-5" role="alert">
            <p class="text-[15px] font-semibold">No pudimos cargar los reportes.</p>
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
          @if (!store.items().length) {
            <div
              class="mt-5 rounded-2xl border border-dashed border-line-dash px-5 py-8 text-center"
            >
              @if (view() === 'open') {
                <p class="font-display text-[20px] font-bold">Todo al día</p>
                <p class="mt-1 text-[14.5px] text-muted">
                  Cuando alguien reporte una reseña, aparece acá.
                </p>
              } @else {
                <p class="text-[14.5px] text-muted">Todavía no resolviste ningún reporte.</p>
              }
            </div>
          } @else {
            <ul class="mt-5 flex flex-col gap-3">
              @for (r of store.items(); track r.reportId) {
                <li
                  class="rounded-2xl border border-line bg-surface p-4 sm:p-5"
                  [attr.data-testid]="'report-' + r.reportId"
                >
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <app-stars [rating]="r.rating" [size]="16" />
                    <span
                      class="rounded-md bg-sand px-1.5 py-0.5 text-[12.5px] font-semibold text-ink-soft"
                    >
                      {{ r.kind === 'INVITADA' ? 'Invitada' : 'Verificada' }}
                    </span>
                    @if (r.status !== 'OPEN') {
                      <span
                        class="rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold"
                        [class]="
                          r.status === 'HIDDEN'
                            ? 'bg-danger-soft text-danger'
                            : 'bg-sand text-ink-soft'
                        "
                      >
                        {{
                          r.status === 'HIDDEN'
                            ? r.hidden
                              ? 'Oculta'
                              : 'Restaurada'
                            : 'Descartado'
                        }}
                      </span>
                    }
                  </div>
                  <p class="mt-2 text-[14.5px] text-ink-soft">
                    <strong class="font-semibold text-ink">{{ r.reviewer }}</strong> sobre
                    <a
                      [routerLink]="['/profesional', r.professionalId]"
                      class="font-semibold text-brand underline-offset-2 hover:underline"
                      >{{ r.professional }}</a
                    >
                  </p>
                  <blockquote
                    class="mt-2 rounded-xl bg-sand px-3.5 py-3 text-[15px] leading-6 whitespace-pre-line text-ink"
                  >
                    {{ r.comment || 'Sin comentario' }}
                  </blockquote>
                  <p class="mt-3 text-[14px] text-ink-soft">
                    <strong class="font-semibold text-ink">{{ reason(r) }}</strong>
                    · reportó {{ r.reporterEmail }} · {{ when(r.reportedAt) }}
                  </p>
                  @if (r.details) {
                    <p class="mt-1 text-[14px] text-muted">“{{ r.details }}”</p>
                  }
                  @if (r.status !== 'OPEN') {
                    <p class="mt-1 text-[14px] text-muted">
                      Resuelto por {{ r.resolvedBy }} · {{ when(r.resolvedAt) }}
                      @if (r.hiddenReason) {
                        · Motivo: {{ r.hiddenReason }}
                      }
                    </p>
                  }
                  <div class="mt-4 flex flex-col gap-2 sm:flex-row">
                    @if (r.status === 'OPEN') {
                      <button
                        type="button"
                        class="button-primary min-h-11 rounded-xl px-4 text-[15px] font-semibold disabled:opacity-60"
                        [disabled]="!!store.acting()"
                        (click)="askHide(r)"
                        data-testid="hide"
                      >
                        Ocultar reseña
                      </button>
                      <button
                        type="button"
                        class="button-secondary min-h-11 rounded-xl px-4 text-[15px] font-semibold disabled:opacity-60"
                        [disabled]="!!store.acting()"
                        (click)="store.dismiss(r.reportId)"
                        data-testid="dismiss"
                      >
                        Descartar reporte
                      </button>
                    } @else if (r.hidden) {
                      <button
                        type="button"
                        class="button-secondary min-h-11 rounded-xl px-4 text-[15px] font-semibold disabled:opacity-60"
                        [disabled]="!!store.acting()"
                        (click)="store.restore(r)"
                        data-testid="restore"
                      >
                        Volver a mostrar
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        }
        @default {
          <p class="mt-6 text-[15px] text-muted" role="status">Cargando reportes…</p>
        }
      }
    </main>

    <app-dialog
      [open]="!!hiding()"
      labelledBy="hide-title"
      [dismissable]="!store.acting()"
      (dismiss)="hiding.set(null)"
    >
      <h2 id="hide-title" class="font-display text-2xl font-bold">Ocultar reseña</h2>
      <p class="mt-2 text-[15px] leading-6 text-muted">
        Deja de mostrarse y de contar en el puntaje. No se borra: podés volver a mostrarla. El
        motivo es interno.
      </p>
      <label for="hide-reason" class="mt-4 block text-[15px] font-semibold text-ink">Motivo</label>
      <textarea
        id="hide-reason"
        rows="3"
        [maxLength]="limits.max"
        [(ngModel)]="hideReason"
        class="mt-1.5 w-full min-w-0 resize-y rounded-xl field-control px-3.5 py-3 text-base text-ink"
      ></textarea>
      <div class="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          class="button-primary min-h-12 rounded-xl px-5 text-[16px] font-semibold disabled:opacity-60 sm:flex-1"
          [disabled]="!!store.acting() || hideReason().trim().length < limits.min"
          (click)="confirmHide()"
          data-testid="hide-confirm"
        >
          {{ store.acting() ? 'Guardando…' : 'Ocultar' }}
        </button>
        <button
          type="button"
          class="button-secondary min-h-12 rounded-xl px-5 text-[16px] font-semibold sm:flex-1"
          [disabled]="!!store.acting()"
          (click)="hiding.set(null)"
        >
          Cancelar
        </button>
      </div>
    </app-dialog>
  `,
})
export class AdminReportsPage {
  protected readonly store = inject(AdminReportsStore);
  /** `?vista=resueltos` (query param). */
  readonly vista = input<string | undefined>();

  protected readonly limits = HIDE_REASON_LIMITS;
  protected readonly hiding = signal<AdminReport | null>(null);
  protected readonly hideReason = signal('');
  protected view = (): AdminReportView => this.store.view();

  constructor() {
    effect(() => {
      void this.store.load(this.vista() === 'resueltos' ? 'resolved' : 'open');
    });
  }

  protected reason(r: AdminReport): string {
    return REASONS[r.reason];
  }

  protected when(value: string | null): string {
    return formatTimestamp(value);
  }

  protected askHide(r: AdminReport): void {
    this.hideReason.set('');
    this.hiding.set(r);
  }

  protected async confirmHide(): Promise<void> {
    const r = this.hiding();
    if (!r) return;
    const ok = await this.store.hide(r.reportId, this.hideReason());
    if (ok || this.store.actionError()) this.hiding.set(null);
  }
}
