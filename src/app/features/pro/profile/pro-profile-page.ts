import { EmailNotificationsToggle } from '../../../shared/components/email-notifications-toggle/email-notifications-toggle';
import { DeleteAccount } from '../../../shared/components/delete-account/delete-account';
import {
  CoverageDraft,
  CoverageEditor,
  coverageIssue,
  coveragePayload,
} from '../../../shared/components/coverage-editor/coverage-editor';
import { ProfileShare } from '../../../shared/components/profile-share/profile-share';
import { ReviewInvite } from '../../../shared/components/review-invite/review-invite';
import { Tag } from '../../../shared/components/tag/tag';
import { ProBadge } from '../../../shared/components/plan-badges/plan-badges';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { toLocalityRef } from '../../../core/models/locality';
import { coverageText } from '../../../core/models/professional';
import {
  FeaturedIneligibility,
  OfferedService,
  OwnProfessional,
  OwnVerification,
} from '../../../core/models/pro-profile';
import { CatalogStore } from '../../../core/state/catalog.store';
import { ProStore, ProfileSection } from '../../../core/state/pro.store';
import { WorkPhotosStore } from '../../../core/state/work-photos.store';
import { AvailabilitySwitch } from '../../../shared/components/availability-switch/availability-switch';
import { AvatarEditor } from './avatar-editor';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';
import { LicenseCard } from './license-card';
import { WorkPhotosEditor } from './work-photos-editor';
import { LICENSE_TONES, LICENSE_UI } from './license-ui';

type EditableSection = Exclude<ProfileSection, 'status'>;

const MAX_SERVICES = 10;

/**
 * "Mi perfil profesional" REAL: administración por secciones (no repite el
 * onboarding). Cada sección muestra el estado actual y se edita y guarda por
 * separado. Todo sale de GET /pro/me; nada es demo.
 */
/** Por qué un PRO no aparece en destacados, en lenguaje de acción. */
export const FEATURED_HINTS: Record<FeaturedIneligibility, string> = {
  NOT_PRO: 'Los espacios destacados son parte de Resuelve PRO.',
  PROFILE_PAUSED:
    'Tu perfil está pausado. Reactivalo para volver a aparecer en búsquedas y en destacados.',
  NO_PUBLIC_SERVICE:
    'Necesitás al menos un servicio activo en Resuelve.',
  NO_COVERAGE: 'Elegí las localidades donde trabajás (toda la ciudad o algunos barrios) para aparecer cuando te buscan.',
};

/** Cubre alguna localidad (toda la ciudad o algún barrio). */
function hasCoverage(me: OwnProfessional): boolean {
  if (me.coverage) return me.coverage.some((c) => c.coversEntireCity || c.zones.length > 0);
  return me.coversEntireCity || me.zones.length > 0;
}

@Component({
  selector: 'app-pro-profile-page',
  imports: [
    CoverageEditor,
    ProfileShare,
    ReviewInvite,
    NgTemplateOutlet,
    RouterLink,
    AvatarEditor,
    Icon,
    AvailabilitySwitch,
    Dialog,
    LicenseCard,
    Tag,
    ProBadge,
    WorkPhotosEditor,
    DeleteAccount,
    EmailNotificationsToggle,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-profile-page.html',
  styleUrl: './pro-profile-page.css',
})
export class ProProfilePage {
  private readonly editIntent = toSignal(inject(ActivatedRoute).queryParamMap);
  private consumedEditIntent: string | null = null;
  protected readonly store = inject(ProStore);
  protected readonly catalog = inject(CatalogStore);
  /** Solo para sugerir fotos cuando el perfil ya está completo (lo carga el editor de trabajos). */
  protected readonly photos = inject(WorkPhotosStore);

  /** Atajos de mobile y tablet: llevan a cada sección sin scrollear todo el perfil. */
  protected readonly shortcuts = [
    { id: 'profile-presentation', label: 'Presentación' },
    { id: 'profile-portfolio', label: 'Trabajos' },
    { id: 'profile-services', label: 'Servicios' },
    { id: 'profile-coverage', label: 'Cobertura' },
  ];

  protected readonly coverage = coverageText;
  protected readonly licenseUi = LICENSE_UI;
  protected readonly licenseTones = LICENSE_TONES;
  protected readonly maxServices = MAX_SERVICES;

  protected readonly editing = signal<EditableSection | null>(null);
  protected readonly confirmPause = signal(false);

  // Borradores de edición (solo mientras la sección está abierta).
  protected readonly headline = signal('');
  protected readonly bio = signal('');
  protected readonly years = signal(0);
  protected readonly serviceIds = signal<string[]>([]);
  /** Borrador de la cobertura (localidades + toda la ciudad o barrios). */
  protected readonly coverageDraft = signal<CoverageDraft[]>([]);
  protected readonly primaryId = signal<string | null>(null);
  protected readonly localError = signal<{ section: EditableSection; message: string } | null>(
    null,
  );

  private readonly firstField = viewChild<ElementRef<HTMLElement>>('firstField');

  protected readonly me = computed(() => this.store.ownProfile());
  /** PRO que todavía no puede ocupar destacados: qué falta, con el motivo real del backend. */
  protected readonly featuredHint = computed(
    () => FEATURED_HINTS[this.me()?.featured?.reason ?? 'NOT_PRO'],
  );
  /** "25 de diciembre de 2026" (vencimiento de un PRO temporal, hora de Argentina). */
  protected expiry(iso: string): string {
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date(iso));
  }

  /** Servicios con matrícula para verificar (opcional), cada uno con su historial de envíos. */
  protected readonly licensed = computed(() => {
    const me = this.me();
    if (!me) return [];
    return me.offeredServices
      .filter((s) => s.requiresLicense)
      .map((service) => ({
        service,
        history: me.verificationRequests.filter(
          (v: OwnVerification) => v.type === 'LICENSE' && v.serviceId === service.id,
        ),
      }));
  });

  /** Servicios que se quitarían al guardar (para avisar que deja de aparecer en esas búsquedas). */
  protected readonly removing = computed(() => {
    const me = this.me();
    if (!me || this.editing() !== 'services') return [];
    return me.offeredServices.filter((s) => !this.serviceIds().includes(s.id)).map((s) => s.name);
  });

  /**
   * "Perfil completo" con criterios reales y visibles (sin porcentajes):
   * presentación, al menos un servicio publicado y cobertura.
   */
  /** Criterios reales de "perfil completo" (los mismos que `missing`), como lista. */
  protected readonly checklist = computed(() => {
    const me = this.me();
    if (!me) return [];
    return [
      { label: 'Presentación', section: 'presentation' as const, done: !!me.bio?.trim() },
      {
        label: 'Al menos un servicio habilitado',
        section: 'services' as const,
        done: me.offeredServices.some((s) => s.public),
      },
      {
        label: 'Dónde trabajás',
        section: 'coverage' as const,
        done: hasCoverage(me),
      },
    ];
  });
  /** Lo que falta de la lista (cada ítem abre su sección para editar). */
  protected readonly pending = computed(() => this.checklist().filter((c) => !c.done));
  protected readonly statusTitle = computed(() => {
    if (this.me()?.status !== 'ACTIVE') return 'Perfil pausado';
    return this.missing().length ? 'Perfil visible' : 'Perfil visible y completo';
  });
  /** Matrículas VERIFIED de sus servicios (dato propio, no público). */
  protected readonly verifiedCount = computed(
    () => this.me()?.offeredServices.filter((s) => s.licenseStatus === 'VERIFIED').length ?? 0,
  );

  protected readonly missing = computed(() => {
    const me = this.me();
    if (!me) return [];
    const list: string[] = [];
    if (!me.bio?.trim()) list.push('una presentación');
    if (!me.offeredServices.some((s) => s.public)) list.push('un servicio habilitado');
    if (!hasCoverage(me)) list.push('dónde trabajás');
    return list;
  });

  protected readonly errorFor = (section: ProfileSection) => {
    const local = this.localError();
    if (local && local.section === section) return local.message;
    const e = this.store.sectionError();
    return e && e.section === section ? e.message : null;
  };

  constructor() {
    this.catalog.loadCatalog();
    // Si otro lado recarga el perfil mientras se edita, no se pisa el borrador.
    effect(() => {
      if (!this.me()) untracked(() => this.editing.set(null));
    });
    effect(() => {
      const section = this.editIntent()?.get('editar');
      if (!this.me() || !section || section === this.consumedEditIntent) return;
      if (section === 'presentation' || section === 'services' || section === 'coverage') {
        this.consumedEditIntent = section;
        untracked(() => this.edit(section));
      }
    });
  }

  protected goTo(id: string): void {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  protected isSaving(section: ProfileSection): boolean {
    return this.store.savingSection() === section;
  }

  protected edit(section: EditableSection): void {
    const me = this.me();
    if (!me) return;
    this.localError.set(null);
    this.store.sectionError.set(null);
    if (section === 'presentation') {
      this.headline.set(me.headline ?? '');
      this.bio.set(me.bio ?? '');
      this.years.set(me.yearsExperience);
    } else if (section === 'services') {
      this.serviceIds.set(me.offeredServices.map((s) => s.id));
    } else {
      // Se edita la cobertura guardada tal cual (incluidos barrios guardados de "toda la ciudad").
      const saved = me.savedCoverage ?? me.coverage ?? [];
      this.coverageDraft.set(
        saved.flatMap((c) => {
          const locality = toLocalityRef(c.locality);
          return locality ? [{ locality, coversEntireCity: c.coversEntireCity, zoneIds: c.zones.map((z) => z.id) }] : [];
        }),
      );
      this.primaryId.set(me.primaryLocality?.id ?? this.coverageDraft()[0]?.locality.id ?? null);
    }
    this.editing.set(section);
    setTimeout(() => this.firstField()?.nativeElement.focus());
  }

  protected cancel(): void {
    this.localError.set(null);
    this.editing.set(null);
  }

  protected toggleService(id: string): void {
    const ids = this.serviceIds();
    if (!ids.includes(id) && ids.length >= MAX_SERVICES) {
      this.localError.set({
        section: 'services',
        message: `Podés ofrecer hasta ${MAX_SERVICES} servicios.`,
      });
      return;
    }
    this.localError.set(null);
    this.serviceIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  protected zoneList(zones: { name: string }[]): string {
    return zones.map((z) => z.name).join(', ') || 'Sin barrios';
  }

  protected coverageCities(me: OwnProfessional): string {
    const names = (me.coverage ?? []).map((c) => c.locality.name);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : (names[0] ?? '');
  }

  protected async save(section: EditableSection): Promise<void> {
    const fail = (message: string) => this.localError.set({ section, message });
    let ok = false;
    if (section === 'presentation') {
      const headline = this.headline().trim();
      const years = this.years();
      if (!headline) return fail('Escribí un título profesional.');
      if (!Number.isInteger(years) || years < 0 || years > 70)
        return fail('Ingresá entre 0 y 70 años de experiencia.');
      ok = await this.store.updateProfile('presentation', {
        headline,
        bio: this.bio().trim(),
        yearsExperience: years,
      });
    } else if (section === 'services') {
      if (!this.serviceIds().length) return fail('Elegí al menos un servicio.');
      ok = await this.store.updateProfile('services', { serviceIds: this.serviceIds() });
    } else {
      const issue = coverageIssue(this.coverageDraft(), this.primaryId());
      if (issue) return fail(issue);
      // "Toda la ciudad" conserva los barrios guardados (se ignoran) para poder volver.
      ok = await this.store.updateProfile('coverage', coveragePayload(this.coverageDraft(), this.primaryId()));
    }
    if (ok) this.editing.set(null);
  }

  protected async pause(): Promise<void> {
    const ok = await this.store.setStatus('PAUSED');
    if (ok) this.confirmPause.set(false);
  }

  protected closePause(): void {
    if (!this.isSaving('status')) this.confirmPause.set(false);
  }

  protected licenseChip(s: OfferedService) {
    if (s.licenseStatus === 'NOT_REQUIRED') return null;
    const ui = LICENSE_UI[s.licenseStatus];
    return { text: ui.chip, tone: LICENSE_TONES[ui.tone] };
  }

  protected yearsText(n: number): string {
    return n === 1 ? '1 año de experiencia' : `${n} años de experiencia`;
  }

  protected setYears(event: Event): void {
    this.years.set(Number((event.target as HTMLInputElement).value));
  }
}
