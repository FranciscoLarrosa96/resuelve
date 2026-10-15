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
  expect([...el.querySelectorAll('article h2')].map((h) => h.textContent)).toEqual(['Gratis', 'PRO', 'PRO Plus']);
  expect(el.textContent).toContain('Recomendado');
  expect(el.textContent).not.toContain('Más elegido');
  expect(el.textContent).toContain('$24.900');
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Elegir PRO Plus'))!.click();
  expect(selected).toEqual(['PRO_PLUS']);
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
