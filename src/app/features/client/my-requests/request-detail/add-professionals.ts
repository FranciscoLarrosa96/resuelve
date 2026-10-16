import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../../../core/api/api-error';
import { RequestsApiService } from '../../../../core/api/requests-api.service';
import { avatarOf } from '../../../../core/models/avatar';
import { InvitationOptions } from '../../../../core/models/invitation-options';
import { ProfessionalSummary } from '../../../../core/models/professional';
import { ToastService } from '../../../../core/services/toast.service';
import { responseText } from '../../../../core/utils/professional-facts';
import { refreshWhenDue } from '../../../../core/utils/refresh-when-due';
import { reputationLabel, reputationText } from '../../../../core/utils/reputation';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { ContactActions } from '../../../../shared/components/contact-actions/contact-actions';
import { Icon } from '../../../../shared/components/icon/icon';

/**
 * "Sumar profesionales" en el detalle de un pedido enviado que todavía no tiene presupuestos.
 * Solo lee y propone: sumar es el mismo `POST /requests/:id/invitations` de siempre, que el
 * backend revalida con la misma regla de "quién puede responder". Nada se suma ni se avisa
 * solo. WhatsApp o llamar son contacto directo: no suman al profesional al pedido ni cuentan
 * como presupuesto. Sin una salida útil (nadie para sumar y nadie con contacto directo) solo
 * se explica la situación.
 */
@Component({
  selector: 'app-add-professionals',
  imports: [RouterLink, Avatar, ContactActions, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (data(); as d) {
      @if (d.state !== 'NOT_APPLICABLE') {
        <section
          id="sumar-profesionales"
          class="mt-8 scroll-mt-24 rounded-2xl border bg-surface p-4.5 sm:p-5"
          [class.border-accent-line]="highlighted()"
          [class.border-line]="!highlighted()"
          aria-labelledby="add-pros-title"
          data-testid="add-professionals"
          [attr.data-emphasis]="d.emphasis"
        >
          <h2 id="add-pros-title" class="text-lg font-bold">Sumar profesionales</h2>
          <p class="mt-1.5 text-[15px] leading-[1.45] text-ink-soft" data-testid="add-pros-intro">{{ intro() }}</p>

          @if (d.state === 'AVAILABLE') {
            <ul class="mt-4 flex flex-col gap-2.5" aria-label="Profesionales que podés sumar">
              @for (p of d.candidates; track p.id) {
                <li class="flex items-center gap-3 rounded-xl border border-line p-3" data-testid="add-pros-candidate">
                  <input
                    type="checkbox"
                    class="size-5 shrink-0 accent-[var(--color-primary)]"
                    [id]="'add-' + p.id"
                    [checked]="isChosen(p.id)"
                    [disabled]="busy() || (!isChosen(p.id) && full())"
                    (change)="toggle(p.id)"
                  />
                  <app-avatar [subject]="avatar(p)" alt="" class="size-11 rounded-xl text-sm" />
                  <label [for]="'add-' + p.id" class="min-w-0 flex-1 cursor-pointer">
                    <span class="block truncate text-[15.5px] font-semibold">{{ p.displayName }}</span>
                    <span class="block text-[13.5px] text-muted" [attr.aria-label]="label(p)">{{ reputation(p) }}</span>
                    @if (response(p); as r) {
                      <span class="block text-[13.5px] text-muted">{{ r }}</span>
                    }
                  </label>
                  <a [routerLink]="['/profesional', p.id]" class="min-h-11 px-1 text-[13.5px] font-semibold text-brand-dark underline-offset-3 hover:underline inline-flex items-center">Ver perfil</a>
                </li>
              }
            </ul>
            <p class="mt-2 text-[13.5px] text-muted">
              Podés sumar hasta {{ d.remainingInvitations }}
              {{ d.remainingInvitations === 1 ? 'profesional más' : 'profesionales más' }} (máximo {{ d.maxInvitations }} por solicitud).
            </p>
            @if (error(); as e) {
              <p class="mt-2 text-[14px] font-medium text-danger" role="alert">{{ e }}</p>
            }
            <button
              type="button"
              class="button-primary mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl px-5 text-[15px] font-semibold disabled:opacity-55"
              [disabled]="!chosen().length || busy()"
              [attr.aria-busy]="busy()"
              data-testid="add-pros-submit"
              (click)="submit()"
            >
              <app-icon name="send" [size]="16" />{{ submitText() }}
            </button>
          }

          @if (d.directContacts.length) {
            <div class="mt-5 border-t border-line pt-4" data-testid="add-pros-direct">
              <h3 class="text-[15px] font-bold">Escribirles directo</h3>
              <p class="mt-1 text-[13.5px] leading-[1.45] text-muted">
                WhatsApp o llamada es solo contacto: no los suma a tu solicitud ni cuenta como presupuesto.
              </p>
              <ul class="mt-3 flex flex-col gap-2.5">
                @for (p of d.directContacts; track p.id) {
                  <li class="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                    <app-avatar [subject]="avatar(p)" alt="" class="size-10 rounded-xl text-sm" />
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-[15px] font-semibold">{{ p.displayName }}</div>
                      @if (p.invited) {
                        <div class="text-[13px] text-muted">Ya recibió tu solicitud</div>
                      }
                    </div>
                    <app-contact-actions [professional]="p" />
                  </li>
                }
              </ul>
            </div>
          }
          @if (status(); as s) {
            <p class="sr-only" role="status">{{ s }}</p>
          }
        </section>
      }
    }
  `,
})
export class AddProfessionals {
  readonly requestId = input.required<string>();
  /** El cliente sumó profesionales: la página relee la solicitud. */
  readonly added = output<void>();

  private readonly api = inject(RequestsApiService);
  private readonly toast = inject(ToastService);

  protected readonly data = signal<InvitationOptions | null>(null);
  protected readonly selected = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal<string | null>(null);

  protected readonly avatar = avatarOf;
  protected readonly reputation = reputationText;
  protected readonly label = reputationLabel;
  protected readonly response = (p: ProfessionalSummary) => responseText(p.averageResponseMinutes);

  /** Solo los que siguen siendo recomendados (la lista se actualiza al releer). */
  protected readonly chosen = computed(() => {
    const ids = new Set(this.data()?.candidates.map((c) => c.id) ?? []);
    return this.selected().filter((id) => ids.has(id));
  });
  protected readonly full = computed(() => this.chosen().length >= (this.data()?.remainingInvitations ?? 0));
  protected readonly highlighted = computed(() => {
    const e = this.data()?.emphasis;
    return e === 'SUGGEST' || e === 'URGENT_GUIDE';
  });
  protected readonly submitText = computed(() => {
    const n = this.chosen().length;
    return n === 0 ? 'Elegí a quién sumar' : n === 1 ? 'Sumar 1 profesional' : `Sumar ${n} profesionales`;
  });

  protected readonly intro = computed(() => {
    const d = this.data();
    if (!d) return '';
    const hasDirect = d.directContacts.length > 0;
    if (d.state === 'LIMIT_REACHED') {
      return `Ya le pediste presupuesto a ${d.invited} profesionales, el máximo por solicitud.${hasDirect ? ' Si querés, escribiles directo.' : ' Cuando alguno responda, vas a verlo acá.'}`;
    }
    if (d.state === 'NO_CANDIDATES') {
      return `Por ahora no hay otros profesionales que puedan responder este pedido.${hasDirect ? ' Podés escribirles directo a quienes lo habilitaron.' : ' Te avisamos acá apenas llegue un presupuesto.'}`;
    }
    if (d.state === 'QUOTES_FULL') return 'Esta solicitud ya tiene todos los lugares para presupuestos ocupados.';
    if (d.emphasis === 'URGENT_GUIDE') {
      return 'Como es para hoy o urgente, conviene sumar más profesionales desde ahora o escribirles directo: cuantos más reciban tu pedido, antes llega el primer presupuesto.';
    }
    if (d.emphasis === 'SUGGEST') {
      return 'Pasó más de una hora y todavía no recibiste presupuestos. Podés sumar más profesionales a tu solicitud.';
    }
    return 'Si querés que te respondan más profesionales, podés sumar otros a tu solicitud.';
  });

  constructor() {
    effect(() => {
      const id = this.requestId();
      untracked(() => void this.load(id));
    });
    // Pasado el umbral sin presupuestos, relee UNA vez para que el backend decida si se destaca.
    refreshWhenDue(
      () => (this.data()?.state !== 'NOT_APPLICABLE' && this.data()?.emphasis === 'NONE' ? (this.data()?.suggestFrom ?? null) : null),
      () => void this.load(this.requestId()),
    );
  }

  private async load(id: string): Promise<void> {
    try {
      this.data.set(await firstValueFrom(this.api.invitationOptions(id)));
    } catch {
      this.data.set(null);
    }
  }

  protected isChosen(id: string): boolean {
    return this.selected().includes(id);
  }

  protected toggle(id: string): void {
    this.error.set(null);
    this.selected.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  protected async submit(): Promise<void> {
    const ids = this.chosen();
    if (!ids.length || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.inviteProfessionals(this.requestId(), ids, false, 'OTHER', undefined, 'ADD_PROFESSIONALS'));
      this.selected.set([]);
      this.status.set(ids.length === 1 ? 'Sumaste 1 profesional.' : `Sumaste ${ids.length} profesionales.`);
      this.toast.show(ids.length === 1 ? 'Sumaste 1 profesional a tu solicitud.' : `Sumaste ${ids.length} profesionales a tu solicitud.`);
      this.added.emit();
      await this.load(this.requestId());
    } catch (e) {
      const err = classifyError(e);
      const code = err.code;
      // La disponibilidad cambió desde que se mostró la lista: se actualiza y se avisa.
      this.error.set(
        code === 'PROFESSIONAL_NOT_ELIGIBLE'
          ? 'Alguno de los elegidos ya no puede responder. Actualizamos la lista: elegí de nuevo.'
          : code === 'INVITATION_LIMIT_REACHED'
            ? 'Esta solicitud ya llegó al máximo de profesionales.'
            : code === 'REQUEST_QUOTE_LIMIT_REACHED' || code === 'INVALID_REQUEST_STATE'
              ? 'Esta solicitud ya no necesita sumar profesionales.'
              : err.kind === 'network'
                ? 'No hay conexión. Probá de nuevo en un momento.'
                : 'No pudimos sumar a los profesionales. Probá de nuevo.',
      );
      await this.load(this.requestId());
      this.added.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
