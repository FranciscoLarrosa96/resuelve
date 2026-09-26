import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../../core/state/auth.store';
import { ProStore } from '../../../core/state/pro.store';
import { ProPlansPage } from './pro-plans-page';

describe('página de planes', () => {
  it('muestra capacidades reales y PRO próximo sin precio, trial ni activación ficticia', () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { user: signal({ professionalProfileId: 'profile-1' }) } },
      { provide: ProStore, useValue: { plan: signal('free') } },
    ] });
    const fixture = TestBed.createComponent(ProPlansPage);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Tu plan actual');
    expect(host.textContent).toContain('Resuelve PRO');
    expect(host.textContent).toContain('Próximamente');
    expect(host.textContent).toContain('Enviar presupuestos');
    expect(host.textContent).not.toMatch(/14\.900|30 días gratis|Ilimitadas|Probar PRO|Activar PRO/i);
    expect(host.querySelector('button')).toBeNull();
  });

  it('muestra PRO como plan actual solo si ese dato llegó del backend', () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { user: signal({ professionalProfileId: 'profile-1' }) } },
      { provide: ProStore, useValue: { plan: signal('pro') } },
    ] });
    const fixture = TestBed.createComponent(ProPlansPage);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#pro-title')?.parentElement?.textContent).toContain('Tu plan actual');
    expect(host.textContent).not.toContain('Todavía no se puede activar desde la web');
  });
});
