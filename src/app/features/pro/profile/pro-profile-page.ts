import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PRO_PORTFOLIO, PRO_STATS, VERIFICATION_ROWS } from '../../../core/data/pro.data';
import { ProStore } from '../../../core/state/pro.store';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';
import { PROFILE_SECTIONS, ProfileSection, ProfileSectionEditor } from './profile-section-editor';

interface SettingsRow {
  key: string;
  value: string;
  section: ProfileSection | 'availability';
}

@Component({
  selector: 'app-pro-profile-page',
  imports: [RouterLink, Avatar, Icon, ProfileSectionEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-profile-page.html',
})
export class ProProfilePage {
  protected readonly store = inject(ProStore);

  protected readonly sections = PROFILE_SECTIONS;
  protected readonly section = signal<ProfileSection>('perfil');
  protected readonly stats = PRO_STATS;
  protected readonly verified = VERIFICATION_ROWS.filter((v) => v.ok);

  /** Mobile: fila abierta (acordeón). */
  protected readonly openRow = signal<string | null>(null);

  protected readonly servicesText = computed(() => {
    const services = this.store.settings().services;
    const extra = services.length > 3 ? ` y ${services.length - 3} más` : '';
    return services.slice(0, 3).join(' · ') + extra;
  });

  protected readonly rows = computed<SettingsRow[]>(() => {
    const s = this.store.settings();
    return [
      { key: 'Descripción', value: s.description, section: 'perfil' },
      { key: 'Categorías', value: s.categories.join(', ') || 'Sin categorías', section: 'servicios' },
      { key: 'Servicios', value: this.servicesText() || 'Sin servicios', section: 'servicios' },
      { key: 'Zonas de cobertura', value: s.zones.join(', ') || 'Sin zonas', section: 'zonas' },
      { key: 'Horarios', value: s.hours, section: 'zonas' },
      { key: 'Matrícula', value: 'N.º 4.218 · vigente hasta 2027', section: 'verif' },
      { key: 'Portfolio', value: `${PRO_PORTFOLIO.length} fotos`, section: 'portfolio' },
      { key: 'Disponibilidad', value: this.store.available() ? 'Disponible hoy' : 'Pausada hoy', section: 'availability' },
    ];
  });

  protected editorSection(row: SettingsRow): ProfileSection {
    return row.section === 'availability' ? 'perfil' : row.section;
  }

  protected toggleRow(row: SettingsRow): void {
    this.openRow.update((key) => (key === row.key ? null : row.key));
  }
}
