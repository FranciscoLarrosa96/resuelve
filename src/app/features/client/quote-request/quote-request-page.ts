import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChildren } from '@angular/core';
import { Router } from '@angular/router';
import { MAX_INVITATIONS, REQUEST_LIMITS } from '../../../core/models/request';
import { avatarOf } from '../../../core/models/avatar';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { AuthStore } from '../../../core/state/auth.store';
import { MyRequestsStore } from '../../../core/state/my-requests.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { DraftIssue, RequestStore, targetIssueText } from '../../../core/state/request.store';
import { ZonesStore } from '../../../core/state/zones.store';
import { oneDecimal, pluralize } from '../../../core/utils/format';
import { NgTemplateOutlet } from '@angular/common';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { Zone } from '../../../core/models/category';
import { hasReviews, reputationText } from '../../../core/utils/reputation';

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const ISSUE_TEXT: Record<DraftIssue, string> = {
  service: 'elegí el servicio',
  zone: 'elegí tu barrio',
  title: 'poné un título',
  description: `contá el problema (mínimo ${REQUEST_LIMITS.descriptionMin} caracteres)`,
  recipients: 'elegí al menos un profesional',
  target: 'buscá otro profesional (el elegido ya no puede recibir el pedido)',
};

@Component({
  selector: 'app-quote-request-page',
  imports: [NgTemplateOutlet, Avatar, BackButton, Icon, ChipDirective],
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
  protected readonly hasReviews = hasReviews;
  protected readonly reputation = reputationText;

  protected readonly recipientsTitle = computed(() =>
    `Para ${pluralize(this.recipients().length, 'profesional', 'profesionales')}`,
  );

  protected readonly rows = computed(() => [
    { key: 'Problema', value: this.store.problemLabel() },
    { key: 'Urgencia', value: this.store.urgencyLabel() },
    { key: 'Cuándo', value: this.store.whenLabel() },
  ]);

  /**
   * Qué pasa con el pedido, según las reglas reales: se envía SOLO a los
   * elegidos; antes de enviar se pueden sumar hasta 3 en total para comparar.
   */
  protected readonly lead = computed(() => {
    const list = this.store.recipients();
    if (!list.length) return `Elegí hasta ${MAX_INVITATIONS} profesionales y compará sus presupuestos.`;
    const to = `Tu pedido se enviará a ${this.store.recipientNames()}.`;
    const room = MAX_INVITATIONS - list.length;
    if (!room) return `${to} Elegís el presupuesto que más te convenga.`;
    return `${to} Si querés comparar, antes de enviarlo podés sumar ${room === 1 ? 'un profesional más' : `hasta ${room} profesionales más`}.`;
  });

  /** Un cambio del pedido dejó a un elegido sin poder recibirlo (servicio, barrio o urgencia). */
  protected readonly targetProblem = computed(() => {
    const problems = this.store.targetProblems();
    if (!problems.length) return null;
    const service = this.store.serviceName();
    const zone = this.store.zoneName();
    const licensed = !!this.store.service()?.requiresLicense;
    return {
      title:
        problems.length === 1
          ? `${problems[0].professional.firstName} ya no puede recibir este pedido con los cambios que hiciste.`
          : 'Algunos profesionales ya no pueden recibir este pedido con los cambios que hiciste.',
      reasons: problems.map((p) => ({ id: p.professional.id, text: targetIssueText(p.professional.firstName, p.issue, service, zone, licensed) })),
    };
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

  /** "Editar": abre la revisión del pedido y, al terminar, vuelve a ESTA pantalla (mismo profesional). */
  protected editRequest(): void {
    this.store.editFromQuote();
    this.router.navigate(['/solicitud']);
  }

  /** Única salida explícita del flujo dirigido: buscar con el mismo pedido. */
  protected findOthers(): void {
    this.store.changeProfessional();
    this.router.navigate(['/profesionales'], { queryParams: { pedido: 1 } });
  }

  protected pickZone(zone: Zone): void {
    this.store.setZone(zone);
  }

  /**
   * Si la dirección nombra un barrio real ("… Villa Italia"), se sugiere (no se
   * elige solo). Sin mapas ni coordenadas: nunca se adivina por cercanía.
   */
  protected readonly suggestedZone = computed(() => {
    const address = normalize(this.store.exactAddress());
    if (address.length < 4) return null;
    const match = this.zones.zones().find((z) => address.includes(normalize(z.name)));
    return match && match.id !== this.draft().zone?.id ? match : null;
  });

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
