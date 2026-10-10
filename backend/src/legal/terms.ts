/**
 * Versión vigente de los Términos de Uso (`/terminos` en el frontend,
 * `TERMS_VERSION` en `src/app/features/legal/terms-page.ts`: tienen que
 * coincidir). Crear la cuenta implica aceptarlos: el alta guarda esta versión
 * y el momento en `users.terms_version` / `users.terms_accepted_at`.
 *
 * Cambio material de los Términos → nueva versión. Si hay más de una revisión
 * material en el mismo día, se agrega un sufijo de revisión al identificador.
 * Las cuentas con
 * una versión anterior (o `null`, creadas antes de que existieran) quedan
 * identificadas para una futura reaceptación; hoy no se pide.
 */
export const CURRENT_TERMS_VERSION = '2026-10-10.2';
