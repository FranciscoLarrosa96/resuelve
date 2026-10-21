import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PlanOptions } from './plan-options';

it('presenta tres opciones, PRO recomendado y emite Plus sin enviar un importe', () => {
  const fixture = TestBed.createComponent(PlanOptions);
  fixture.componentRef.setInput('info', { free: { quoteLimit: 3 }, pro: { monthlyPriceArs: 15000 }, proPlus: { monthlyPriceArs: 24900 } });
  fixture.componentRef.setInput('allowPurchase', true);
  fixture.componentRef.setInput('allowPlusPurchase', true);
  const selected: string[] = [];
  fixture.componentInstance.choose.subscribe((tier) => selected.push(tier));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  expect([...el.querySelectorAll('article h2')].map((h) => h.textContent)).toEqual(['PRO', 'Gratis']);
  expect(el.textContent).toContain('Recomendado');
  expect(el.textContent).not.toContain('Más elegido');
  expect(el.textContent).not.toContain('$24.900');
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Elegir PRO'))!.click();
  expect(selected).toEqual(['PRO']);
  fixture.componentRef.setInput('busy', true);
  fixture.detectChanges();
  expect([...el.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
});

it('no ofrece comprar Plus si el backend todavía no publica ese plan ni un canal de contratación', () => {
  const fixture = TestBed.createComponent(PlanOptions);
  fixture.componentRef.setInput('allowPurchase', true);
  fixture.componentRef.setInput('info', { free: { quoteLimit: null }, pro: { monthlyPriceArs: 15000 } });
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('Plus'))).toBe(false);
  expect(el.textContent).toContain('Respondés oportunidades nuevas sin límite.');
});

describe('Programar cambio a Plus (transferencia)', () => {
  function setup(scheduleTransfer: boolean, scheduleHint = true) {
    const fixture = TestBed.createComponent(PlanOptions);
    fixture.componentRef.setInput('info', { free: { quoteLimit: 3 }, pro: { monthlyPriceArs: 15000 }, proPlus: { monthlyPriceArs: 24900 } });
    fixture.componentRef.setInput('paid', true);
    fixture.componentRef.setInput('scheduleHint', scheduleHint);
    fixture.componentRef.setInput('scheduleTransfer', scheduleTransfer);
    let clicks = 0;
    fixture.componentInstance.scheduleTransferClick.subscribe(() => clicks++);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { el, clicks: () => clicks, fixture };
  }

  it.each([true, false])('no ofrece Plus, incluso con opciones históricas (%s)', (enabled) => {
    const { el } = setup(enabled);
    expect(el.querySelector('[data-testid="schedule-plus-transfer"]')).toBeNull();
    expect(el.textContent).not.toContain('PRO Plus');
    expect(el.querySelectorAll('article')).toHaveLength(2);
  });
});


it('separa respuestas sin cupo de anticipación, sin prometer demora en hoy, urgentes ni dirigidos', () => {
  const f = TestBed.createComponent(PlanOptions);
  f.detectChanges();
  const host = f.nativeElement as HTMLElement;
  const pro = host.querySelectorAll('article')[0];
  expect(pro.textContent).toContain('Respondé pedidos de búsqueda sin el cupo de Free');
  const rules = host.querySelector('[data-testid="plan-access-rules"]')!.textContent!;
  expect(rules).toContain('el mismo pedido también llega a un Free con espera');
  expect(rules).toContain('hoy, urgentes y dirigidos no tienen demora');
  expect(rules).toContain('Los pedidos dirigidos a vos, WhatsApp y llamadas no consumen oportunidades Free');
});
