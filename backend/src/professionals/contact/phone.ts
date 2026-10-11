/**
 * Teléfonos de contacto públicos del profesional (WhatsApp y llamadas). Única fuente
 * de normalización, validación y armado de enlaces; el frontend replica `normalizePhone`
 * solo para avisar antes de guardar, pero quien decide es el backend.
 *
 * Se guarda en E.164:
 * - celular argentino: `+549` + número nacional de 10 dígitos (característica + abonado);
 * - fijo argentino: `+54` + número nacional de 10 dígitos;
 * - otro país: `+` + código de país + número (8 a 15 dígitos en total).
 *
 * El número nacional argentino tiene siempre 10 dígitos y empieza por 11, 2 o 3 (las
 * características del país). Se aceptan las formas habituales de escribirlo:
 * "+54 9 249 412-3456", "0249 15 412-3456", "249 15 4123456", "(011) 15-1234-5678",
 * "2494123456"… El "15" de los celulares se quita y el "0" de la característica también.
 */

export type PhoneKind = 'MOBILE' | 'LANDLINE';

export type PhoneProblem = 'EMPTY' | 'INVALID';

export interface NormalizedPhone {
  /** E.164: `+5492494123456`. */
  e164: string;
}

const AR_NATIONAL = /^(11|[23]\d)\d{8}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

/** Saca el "15" de un celular escrito a la manera local (característica de 2 a 4 dígitos + 15 + abonado). */
function stripLocalMobilePrefix(digits: string): string | null {
  if (digits.length !== 12) return null;
  for (const areaLength of [2, 3, 4]) {
    if (digits.slice(areaLength, areaLength + 2) !== '15') continue;
    const national = digits.slice(0, areaLength) + digits.slice(areaLength + 2);
    if (AR_NATIONAL.test(national)) return national;
  }
  return null;
}

/**
 * Número nacional argentino (10 dígitos) y si se escribió explícitamente como celular
 * (con el 9 internacional o el 15 local). null = no es un número argentino válido.
 */
function parseArgentine(rest: string): { national: string; mobile: boolean } | null {
  let digits = rest.replace(/^0+/, '');
  let mobile = false;
  if (digits.length === 11 && digits.startsWith('9')) {
    digits = digits.slice(1);
    mobile = true;
  } else if (digits.length === 13 && digits.startsWith('9')) {
    digits = digits.slice(1);
  }
  if (digits.length === 12) {
    const stripped = stripLocalMobilePrefix(digits);
    if (!stripped) return null;
    return { national: stripped, mobile: true };
  }
  return AR_NATIONAL.test(digits) ? { national: digits, mobile } : null;
}

/**
 * Normaliza un teléfono escrito por una persona. `kind` dice cómo tratar un número
 * argentino que no aclara si es celular (10 dígitos sin 9 ni 15): WhatsApp siempre es
 * celular; para llamadas lo elige el profesional (celular o fijo). Un número escrito
 * explícitamente como celular (9 o 15) es celular aunque `kind` diga fijo.
 */
export function normalizePhone(
  input: string | null | undefined,
  kind: PhoneKind,
): NormalizedPhone | { problem: PhoneProblem } {
  const raw = (input ?? '').trim();
  if (!raw) return { problem: 'EMPTY' };
  // Solo dígitos y los separadores habituales; letras o símbolos raros = inválido.
  if (!/^[+\d\s().-]+$/.test(raw) || raw.length > 32) return { problem: 'INVALID' };
  const international = raw.startsWith('+') || raw.replace(/[\s().-]/g, '').startsWith('00');
  let digits = raw.replace(/\D/g, '');
  if (raw.replace(/[\s().-]/g, '').startsWith('00')) digits = digits.slice(2);

  let argentineRest: string | null = null;
  if (international) {
    if (!digits.startsWith('54')) {
      const e164 = `+${digits}`;
      return E164.test(e164) ? { e164 } : { problem: 'INVALID' };
    }
    argentineRest = digits.slice(2);
  } else if (digits.startsWith('54') && (digits.length === 12 || digits.length === 13)) {
    // "54 9 249 …" sin el "+".
    argentineRest = digits.slice(2);
  } else {
    argentineRest = digits;
  }

  const parsed = parseArgentine(argentineRest);
  if (!parsed) return { problem: 'INVALID' };
  const mobile = parsed.mobile || kind === 'MOBILE';
  return { e164: `+54${mobile ? '9' : ''}${parsed.national}` };
}

export function isNormalized(p: NormalizedPhone | { problem: PhoneProblem }): p is NormalizedPhone {
  return 'e164' in p;
}

/** ¿El E.164 guardado es un fijo argentino? (para precargar "Celular / Fijo" al editar). */
export function phoneKindOf(e164: string): PhoneKind {
  return e164.startsWith('+54') && !e164.startsWith('+549') ? 'LANDLINE' : 'MOBILE';
}

/**
 * Cómo se muestra: "+54 9 249 412-3456" / "+54 11 1234-5678" / "+54 249 442-3456".
 * Las características argentinas tienen 2 a 4 dígitos y no hay forma segura de saber cuál
 * sin un padrón: fuera de "11" se agrupan de a 3 (se lee bien y se marca igual).
 */
export function formatPhone(e164: string): string {
  if (!e164.startsWith('+54')) return e164;
  const mobile = e164.startsWith('+549');
  const national = e164.slice(mobile ? 4 : 3);
  const area = national.startsWith('11') ? national.slice(0, 2) : national.slice(0, 3);
  const local = national.slice(area.length);
  const grouped = `${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
  return `+54 ${mobile ? '9 ' : ''}${area} ${grouped}`;
}

/** Mensaje sugerido al abrir WhatsApp. Sin datos del cliente, direcciones ni nada sensible. */
export const WHATSAPP_GREETING = '¡Hola! Te encontré en Resuelve y quería consultarte por un trabajo.';

/** Enlace oficial de WhatsApp (formato internacional sin "+") con el mensaje sugerido. */
export function whatsappLink(e164: string, text = WHATSAPP_GREETING): string {
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}`;
}

/** Enlace para llamar desde el celular. */
export function telLink(e164: string): string {
  return `tel:${e164}`;
}
