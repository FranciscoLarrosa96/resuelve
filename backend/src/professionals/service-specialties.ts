import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { contactProblem } from '../common/text/contact-in-text';

export interface ServiceSpecialties {
  serviceId: string;
  names: string[];
}

/** Presentación propia, disponible en Free y PRO. Nunca crea rubros ni otorga matrículas. */
export function normalizeSpecialties(
  input: ServiceSpecialties[],
  offeredIds: readonly string[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const fail = (message: string): never => {
    throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, message);
  };
  for (const item of input) {
    if (!offeredIds.includes(item.serviceId)) fail('Vinculá cada especialidad a un servicio que ofrecés.');
    if (result.has(item.serviceId)) fail('No repitas el servicio de las especialidades.');
    if (item.names.length > 5) fail('Podés agregar hasta 5 especialidades por servicio.');
    const names: string[] = [];
    const seen = new Set<string>();
    for (const raw of item.names) {
      const name = raw.replace(/\s+/g, ' ').trim();
      if (name.length < 2 || name.length > 60) fail('Cada especialidad debe tener entre 2 y 60 caracteres.');
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f\u007f]/u.test(name)) fail('Usá texto simple para las especialidades.');
      const contact = contactProblem(name);
      if (contact) fail(contact);
      if (/(?:https?:\/\/|www\.)/i.test(name)) fail('No incluyas enlaces en las especialidades.');
      const key = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es');
      if (seen.has(key)) fail('No repitas la misma especialidad.');
      seen.add(key);
      names.push(name);
    }
    result.set(item.serviceId, names);
  }
  return result;
}
