import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { coverageText } from '../../../core/models/professional';
import { OfferedService, OwnVerification } from '../../../core/models/pro-profile';
import { CatalogStore } from '../../../core/state/catalog.store';
import { ProStore, ProfileSection } from '../../../core/state/pro.store';
import { ZonesStore } from '../../../core/state/zones.store';
import { AvailabilitySwitch } from '../../../shared/components/availability-switch/availability-switch';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';
import { LicenseCard } from './license-card';
import { LICENSE_TONES, LICENSE_UI } from './license-ui';

type EditableSection = Exclude<ProfileSection, 'status'>;

const MAX_SERVICES = 10;
const MAX_ZONES = 30;

/**
 * "Mi perfil profesional" REAL: administración por secciones (no repite el
 * onboarding). Cada sección muestra el estado actual y se edita y guarda por
 * separado. Todo sale de GET /pro/me; nada es demo.
 */
@Component({
  selector: 'app-pro-profile-page',
  imports: [NgTemplateOutlet, RouterLink, Avatar, Icon, AvailabilitySwitch, Dialog, LicenseCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-profile-page.html',
})
export class ProProfilePage {
  protected readonly store = inject(ProStore);
  protected readonly catalog = inject(CatalogStore);
  protected readonly zonesStore = inject(ZonesStore);

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
  protected readonly entireCity = signal(false);
  protected readonly zoneIds = signal<string[]>([]);
  protected readonly localError = signal<{ section: EditableSection; message: string } | null>(null);

  private readonly firstField = viewChild<ElementRef<HTMLElement>>('firstField');

  protected readonly me = computed(() => this.store.ownProfile());

  /** Servicios que requieren matrícula, cada uno con su historial de envíos. */
  protected readonly licensed = computed(() => {
    const me = this.me();
    if (!me) return [];
    return me.offeredServices
      .filter((s) => s.requiresLicense)
      .map((service) => ({
        service,
        history: me.verificationRequests.filter((v: OwnVerification) => v.type === 'LICENSE' && v.serviceId === service.id),
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
  protected readonly missing = computed(() => {
    const me = this.me();
    if (!me) return [];
    const list: string[] = [];
    if (!me.bio?.trim()) list.push('una presentación');
    if (!me.offeredServices.some((s) => s.public)) list.push('un servicio habilitado');
    if (!me.coversEntireCity && !me.zones.length) list.push('dónde trabajás');
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
    this.zonesStore.load();
    // Si otro lado recarga el perfil mientras se edita, no se pisa el borrador.
    effect(() => {
      if (!this.me()) untracked(() => this.editing.set(null));
    });
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
      this.entireCity.set(me.coversEntireCity);
      this.zoneIds.set(me.savedZones.map((z) => z.id));
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
      this.localError.set({ section: 'services', message: `Podés ofrecer hasta ${MAX_SERVICES} servicios.` });
      return;
    }
    this.localError.set(null);
    this.serviceIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  protected toggleZone(id: string): void {
    const ids = this.zoneIds();
    if (!ids.includes(id) && ids.length >= MAX_ZONES) return;
    this.localError.set(null);
    this.zoneIds.set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  protected async save(section: EditableSection): Promise<void> {
    const fail = (message: string) => this.localError.set({ section, message });
    let ok = false;
    if (section === 'presentation') {
      const headline = this.headline().trim();
      const years = this.years();
      if (!headline) return fail('Escribí un título profesional.');
      if (!Number.isInteger(years) || years < 0 || years > 70) return fail('Ingresá entre 0 y 70 años de experiencia.');
      ok = await this.store.updateProfile('presentation', { headline, bio: this.bio().trim(), yearsExperience: years });
    } else if (section === 'services') {
      if (!this.serviceIds().length) return fail('Elegí al menos un servicio.');
      ok = await this.store.updateProfile('services', { serviceIds: this.serviceIds() });
    } else {
      if (!this.entireCity() && !this.zoneIds().length) return fail('Elegí al menos un barrio o marcá “Todo Tandil”.');
      // "Todo Tandil" conserva los barrios guardados (se ignoran) para poder volver.
      ok = await this.store.updateProfile(
        'coverage',
        this.entireCity() ? { coversEntireCity: true } : { coversEntireCity: false, zoneIds: this.zoneIds() },
      );
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
