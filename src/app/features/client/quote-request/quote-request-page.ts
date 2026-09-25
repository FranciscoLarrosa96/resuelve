import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChildren } from '@angular/core';
import { Router } from '@angular/router';
import { REQUEST_LIMITS } from '../../../core/models/request';
import { avatarOf } from '../../../core/models/avatar';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { AuthStore } from '../../../core/state/auth.store';
import { MyRequestsStore } from '../../../core/state/my-requests.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { DraftIssue, RequestStore } from '../../../core/state/request.store';
import { ZonesStore } from '../../../core/state/zones.store';
import { oneDecimal, pluralize } from '../../../core/utils/format';
import { NgTemplateOutlet } from '@angular/common';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';

const ISSUE_TEXT: Record<DraftIssue, string> = {
  service: 'elegí el servicio',
  zone: 'elegí tu barrio',
  title: 'poné un título',
  description: `contá el problema (mínimo ${REQUEST_LIMITS.descriptionMin} caracteres)`,
  recipients: 'elegí al menos un profesional',
};

@Component({
  selector: 'app-quote-request-page',
  imports: [NgTemplateOutlet, Avatar, BackButton, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quote-request-page.html',
})
export class QuoteRequestPage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  private readonly auth = inject(AuthStore);
  private readonly pros = inject(ProfessionalsStore);
  private readonly myRequests = inject(MyRequestsStore);
  protected readonly store = inject(RequestStore);
  protected readonly zones = inject(ZonesStore);

  protected readonly limits = REQUEST_LIMITS;
  protected readonly draft = this.store.draft;
  private readonly errorBoxes = viewChildren<ElementRef<HTMLElement>>('sendError');

  protected readonly recipients = computed(() =>
    this.store.recipients().map((p) => ({ ...p, avatar: avatarOf(p) })),
  );
  /** Para sumar: otros profesionales reales ya cargados para este mismo servicio. */
  protected readonly addable = computed(() => {
    if (!this.store.canAddRecipient()) return [];
    const serviceId = this.store.draft().service.id;
    if (!serviceId || this.pros.filters().serviceId !== serviceId) return [];
    const ids = this.store.recipientIds();
    const urgent = this.draft().urgency === 'URGENT';
    return this.pros
      .items()
      // Para urgencias el backend solo acepta a quienes están disponibles hoy.
      .filter((p) => !ids.includes(p.id) && (!urgent || p.availableToday))
      .slice(0, 4)
      .map((p) => ({ pro: p, avatar: avatarOf(p) }));
  });
  protected readonly f1 = oneDecimal;

  protected readonly recipientsTitle = computed(() =>
    `Para ${pluralize(this.recipients().length, 'profesional', 'profesionales')}`,
  );

  protected readonly rows = computed(() => {
    const d = this.draft();
    return [
      { key: 'Problema', value: `${this.store.serviceName()} · ${d.title}` },
      { key: 'Urgencia', value: this.store.urgencyLabel() },
      { key: 'Cuándo', value: d.when },
    ];
  });

  protected readonly issuesText = computed(() => {
    const issues = this.store.issues();
    if (!issues.length) return '';
    const parts = issues.map((i) => ISSUE_TEXT[i]);
    const text = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1];
    return 'Para enviar: ' + text + '.';
  });

  protected readonly canSend = computed(() => !this.store.sending() && !this.store.issues().length);

  protected readonly sendLabel = computed(() => {
    if (this.store.sending()) return 'Enviando…';
    const list = this.recipients();
    if (!list.length) return 'Elegí un profesional para continuar';
    return list.length === 1 ? `Enviar solicitud a ${list[0].firstName}` : `Enviar solicitud a los ${list.length}`;
  });

  /** Invitado (ya sabemos que no hay sesión): se le avisa que va a tener que ingresar. */
  protected readonly needsLogin = computed(() => !this.auth.initializing() && !this.auth.authenticated());
  protected readonly footnote = computed(() =>
    this.needsLogin()
      ? 'Para enviarla te vamos a pedir que ingreses. Tu pedido queda guardado.'
      : 'Pedir presupuesto no tiene costo ni compromiso.',
  );

  constructor() {
    this.zones.load();
  }

  protected back(): void {
    this.backNav.back('/profesionales');
  }

  protected editRequest(): void {
    this.store.goToStep(4);
    this.router.navigate(['/solicitud']);
  }

  protected onZone(event: Event): void {
    const zone = this.zones.byId((event.target as HTMLSelectElement).value);
    if (zone) this.store.setZone(zone);
  }

  protected onDescription(event: Event): void {
    this.store.updateDescription((event.target as HTMLTextAreaElement).value, false);
  }

  protected onAddress(event: Event): void {
    this.store.exactAddress.set((event.target as HTMLInputElement).value);
  }

  /**
   * Enviar es una acción personal: sin sesión se va a /ingresar y se vuelve
   * acá. El borrador está en sessionStorage, así que sobrevive incluso a un F5.
   */
  protected async send(): Promise<void> {
    if (!this.canSend()) return;
    await this.auth.whenReady();
    if (!this.auth.authenticated()) {
      this.router.navigate(['/ingresar'], { queryParams: { returnUrl: '/presupuesto' } });
      return;
    }
    const sent = await this.store.send();
    if (sent) {
      this.myRequests.prepend(sent);
      this.router.navigate(['/presupuesto/enviado'], { replaceUrl: true });
    } else {
      // Lleva el foco al error visible (desktop o mobile).
      setTimeout(() => this.errorBoxes().find((e) => e.nativeElement.offsetParent)?.nativeElement.focus());
    }
  }
}
