const arsFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** $ 48.500 */
export function formatARS(amount: number): string {
  return '$ ' + arsFormatter.format(Math.round(amount));
}

/** 48.500 (sin signo, para inputs) */
export function formatThousands(amount: number): string {
  return amount ? arsFormatter.format(amount) : '';
}

/** 4,9 */
export function oneDecimal(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/** Monto decimal del backend ("29001.50") → "$ 29.002". Solo para mostrar. */
export function formatMoney(amount: string | number | null | undefined): string {
  const n = typeof amount === 'number' ? amount : Number(amount ?? 0);
  return formatARS(Number.isFinite(n) ? n : 0);
}

/** "Juan", "Juan y Carlos", "Juan, Carlos y Nicolás" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** 9.5 -> "9:30" */
export function formatHour(hour: number): string {
  return Math.floor(hour) + ':' + (hour % 1 ? '30' : '00');
}

/** Mantiene sólo dígitos (inputs de montos). */
export function onlyDigits(value: string, max = 9): number {
  const digits = value.replace(/\D/g, '').slice(0, max);
  return digits ? parseInt(digits, 10) : 0;
}
