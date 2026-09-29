import { ChangeDetectionStrategy, Component, DestroyRef, inject, input } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { LEGAL_PAGE_STYLES } from './legal-page.styles';

/** Secciones con ancla: índice "En esta página" y enlaces directos (`/privacidad#derechos`). */
export const PRIVACY_SECTIONS = [
  { id: 'resumen', title: 'En pocas palabras' },
  { id: 'responsable', title: 'Responsable de los datos' },
  { id: 'datos', title: 'Qué datos tratamos' },
  { id: 'finalidades', title: 'Para qué los usamos' },
  { id: 'publico', title: 'Qué información puede ser pública' },
  { id: 'compartir', title: 'Con quién se comparten' },
  { id: 'proveedores', title: 'Proveedores que utilizamos' },
  { id: 'ubicacion', title: 'Ubicación' },
  { id: 'fotos', title: 'Fotos, matrículas y documentos' },
  { id: 'pagos', title: 'Pagos de Resuelve PRO' },
  { id: 'almacenamiento', title: 'Cookies y almacenamiento local' },
  { id: 'conservacion', title: 'Cuánto tiempo conservamos los datos' },
  { id: 'seguridad', title: 'Cómo protegemos los datos' },
  { id: 'derechos', title: 'Tus derechos' },
  { id: 'menores', title: 'Menores de edad' },
  { id: 'cambios', title: 'Cambios en esta política' },
] as const;

const DESCRIPTION =
  'Qué datos trata Resuelve, para qué, con quién se comparten y cómo ejercer tus derechos. Marketplace de servicios en Tandil.';

/**
 * Política de Privacidad pública (`/privacidad`, prerenderizada, sin login).
 * Describe SOLO lo que el código hace hoy (auditoría en el PR). Los datos
 * legales del responsable fueron proporcionados por Resuelve. El canal de
 * privacidad por email queda deshabilitado hasta contar con una casilla oficial.
 */
// TODO: habilitar canal de privacidad por email.
@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: LEGAL_PAGE_STYLES,
  template: `
    <div class="mx-auto max-w-3xl animate-fade-in px-4 pt-6 pb-20 sm:px-5 lg:pt-12">
      @if (!embedded()) { <a routerLink="/" class="plain text-sm font-semibold text-brand hover:underline">← Volver a Resuelve</a> }

      <header class="mt-5">
        <p class="text-sm font-semibold tracking-[0.14em] text-brand uppercase">Legal</p>
        <h1 class="mt-2 font-display text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-ink md:text-[44px]">Política de Privacidad</h1>
        <p class="mt-3 text-[15px] text-muted">Última actualización: <time datetime="2026-09-28">28 de septiembre de 2026</time></p>
      </header>

      <nav class="mt-8 border-y border-line py-5" aria-labelledby="toc-title">
        <h2 id="toc-title" class="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">En esta página</h2>
        <ol class="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
          @for (s of sections; track s.id) {
            <li>
              @if (embedded()) { <a [href]="'#' + s.id" class="plain inline-block py-0.5 font-medium text-brand hover:underline">{{ s.title }}</a> }
              @else { <a routerLink="/privacidad" [fragment]="s.id" class="plain inline-block py-0.5 font-medium text-brand hover:underline">{{ s.title }}</a> }
            </li>
          }
        </ol>
      </nav>

      <article class="legal">
        <section class="mt-10" aria-labelledby="resumen">
          <h2 id="resumen" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">En pocas palabras</h2>
          <p>En Resuelve usamos tus datos para que puedas publicar una solicitud, encontrar profesionales en Tandil, recibir y enviar presupuestos, coordinar trabajos y dejar reseñas. Si sos profesional, también para mostrar tu perfil y, si lo contratás, gestionar Resuelve PRO.</p>
          <ul>
            <li>No vendemos tus datos ni los usamos para publicidad.</li>
            <li>Tu dirección exacta y tu teléfono no son públicos: solo los ve el profesional que elegiste, mientras el trabajo está en curso.</li>
            <li>Los documentos de matrícula son privados. Lo único visible es el estado "Matrícula verificada" cuando corresponde.</li>
            <li>Resuelve no recibe ni guarda los datos de tu tarjeta: el pago de PRO se hace en Mercado Pago.</li>
          </ul>
          <p>Resuelve trata los datos personales de acuerdo con las finalidades y prácticas descritas en esta política. Las condiciones para usar Resuelve están en los <a routerLink="/terminos">Términos de Uso</a>.</p>
        </section>

        <section class="mt-12" aria-labelledby="responsable">
          <h2 id="responsable" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Responsable de los datos</h2>
          <p>El responsable del tratamiento de los datos personales de Resuelve es Francisco Larrosa, con domicilio en Tandil, Provincia de Buenos Aires, Argentina.</p>
        </section>

        <section class="mt-12" aria-labelledby="datos">
          <h2 id="datos" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Qué datos tratamos</h2>

          <h3>Tu cuenta</h3>
          <ul>
            <li>Nombre, apellido y email.</li>
            <li>Teléfono, si decidís cargarlo (es opcional).</li>
            <li>Tu contraseña, que guardamos solo en forma de hash (una transformación irreversible): nunca en texto plano.</li>
          </ul>

          <h3>Tu perfil profesional (si ofrecés servicios)</h3>
          <ul>
            <li>Presentación, descripción, años de experiencia y servicios que ofrecés.</li>
            <li>Barrios donde trabajás o si cubrís todo Tandil, si tu perfil está activo o pausado y si estás "Disponible hoy".</li>
            <li>Foto de perfil y fotos de "Trabajos realizados", con su descripción, si las subís.</li>
            <li>Número de matrícula y, si lo adjuntás, el documento que la respalda.</li>
            <li>Métricas calculadas a partir de tu actividad: calificación promedio, cantidad de reseñas, trabajos realizados y tiempo de respuesta.</li>
            <li>Tu plan (Free o PRO), cuántos presupuestos enviaste en el mes y, si pediste PRO o usaste una oferta, cuándo.</li>
          </ul>

          <h3>Solicitudes, presupuestos y trabajos</h3>
          <ul>
            <li>Lo que cargás en una solicitud: servicio, título, descripción, barrio, fecha deseada, franja horaria, urgencia y la dirección exacta del trabajo.</li>
            <li>Los profesionales a los que la enviaste y sus respuestas.</li>
            <li>Los presupuestos: descripción, ítems, montos, disponibilidad y vigencia.</li>
            <li>La coordinación: horarios propuestos, confirmados, rechazados o reprogramados, y quién marcó el trabajo como realizado.</li>
            <li>Las reseñas: puntaje y comentario.</li>
            <li>Las notificaciones dentro de la aplicación y si ya las leíste.</li>
          </ul>

          <h3>Uso técnico y métricas internas</h3>
          <ul>
            <li>Registros técnicos del servidor (método, dirección y resultado de cada pedido, con un identificador de pedido) para operar y detectar errores. No registramos contraseñas, tokens ni el contenido de los formularios.</li>
            <li>Métricas anónimas de exposición: cuántas veces aparece un perfil profesional en los resultados de búsqueda y cuántas veces se abre. Se asocian a una clave aleatoria de la pestaña del navegador (que guardamos transformada), nunca a tu nombre, email o teléfono. El profesional ve solo totales, nunca quién vio su perfil.</li>
          </ul>
        </section>

        <section class="mt-12" aria-labelledby="finalidades">
          <h2 id="finalidades" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Para qué los usamos</h2>
          <ul>
            <li>Crear y administrar tu cuenta e iniciar sesión.</li>
            <li>Conectar clientes con profesionales: buscar, comparar, enviar solicitudes y presupuestos.</li>
            <li>Coordinar el trabajo y la agenda entre el cliente y el profesional elegido.</li>
            <li>Mostrar los perfiles profesionales y su reputación (reseñas y calificación).</li>
            <li>Avisarte dentro de la aplicación cuando hay novedades (una solicitud nueva, un presupuesto, un horario propuesto).</li>
            <li>Revisar matrículas cuando un servicio las requiere.</li>
            <li>Gestionar el plan Free, el cupo mensual de presupuestos y la suscripción Resuelve PRO.</li>
            <li>Mostrarle a cada profesional estadísticas de su propia actividad ("Tu mes").</li>
            <li>Mantener la seguridad del servicio y prevenir usos indebidos (por ejemplo, límites de intentos).</li>
          </ul>
          <p>No usamos tus datos para publicidad de terceros ni te enviamos newsletters o emails de marketing.</p>
        </section>

        <section class="mt-12" aria-labelledby="publico">
          <h2 id="publico" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Qué información puede ser pública</h2>
          <p>Si sos profesional, tu perfil público lo puede ver cualquier persona, con o sin cuenta. Incluye:</p>
          <ul>
            <li>Tu nombre y apellido, y tu foto de perfil si la subiste.</li>
            <li>Tu presentación, descripción, años de experiencia y servicios.</li>
            <li>Los barrios donde trabajás (o "Todo Tandil") y si estás disponible hoy.</li>
            <li>Tu calificación, la cantidad de reseñas y trabajos realizados, y tu tiempo de respuesta promedio.</li>
            <li>Las reseñas que recibiste, con el puntaje, el comentario y solo el nombre de pila de quien la dejó.</li>
            <li>Tus fotos de "Trabajos realizados" con sus descripciones.</li>
            <li>Indicadores como "Matrícula verificada" o "PRO", cuando corresponden.</li>
          </ul>
          <p><strong>Nunca se publican:</strong> tu email, tu teléfono, tu dirección, tus documentos de matrícula, tus datos de pago, tus credenciales ni identificadores internos. Los clientes no tienen perfil público.</p>
        </section>

        <section class="mt-12" aria-labelledby="compartir">
          <h2 id="compartir" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Con quién se comparten</h2>
          <h3>Entre personas que usan Resuelve</h3>
          <ul>
            <li><strong>Profesionales que reciben tu solicitud:</strong> ven el servicio, la descripción, el barrio, la fecha y la urgencia, y de vos solo tu nombre y la inicial del apellido.</li>
            <li><strong>El profesional que elegiste:</strong> además ve tu nombre completo, tu teléfono (si lo cargaste) y la dirección exacta, solo mientras el trabajo está en curso. Cuando el trabajo termina o se cancela, deja de verlos.</li>
            <li><strong>Si sos cliente</strong>, ves de cada profesional su nombre, foto, calificación y el presupuesto que te envió.</li>
            <li>Los profesionales que no fueron elegidos no ven el presupuesto ganador ni tus datos de contacto.</li>
          </ul>
          <h3>Con proveedores</h3>
          <p>Compartimos datos con los proveedores tecnológicos que describimos abajo, solo en la medida necesaria para que el servicio funcione.</p>
          <h3>Por obligación legal</h3>
          <p>Podemos comunicar datos cuando una autoridad competente lo requiera conforme a la ley.</p>
        </section>

        <section class="mt-12" aria-labelledby="proveedores">
          <h2 id="proveedores" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Proveedores que utilizamos</h2>
          <ul>
            <li><strong>Render:</strong> aloja el servidor de Resuelve y la base de datos PostgreSQL donde se guarda la información descrita en esta política.</li>
            <li><strong>Vercel:</strong> aloja y entrega la aplicación web que usás en el navegador.</li>
            <li><strong>Cloudinary:</strong> almacena y entrega imágenes. Las fotos de perfil y de "Trabajos realizados" se guardan como públicas; los documentos de matrícula, como privados.</li>
            <li><strong>Mercado Pago:</strong> procesa el cobro de la suscripción Resuelve PRO.</li>
            <li><strong>Google Maps Platform:</strong> cuando el buscador de direcciones está activo, recibe el texto que escribís o las coordenadas que compartís para sugerir o reconocer la dirección del trabajo.</li>
            <li><strong>Google Fonts:</strong> sirve las tipografías de la aplicación; al cargarlas, tu navegador se conecta a servidores de Google, que reciben datos técnicos como tu dirección IP.</li>
          </ul>
          <p>Algunos proveedores tecnológicos pueden procesar o almacenar información desde jurisdicciones distintas de Argentina, según su infraestructura y términos aplicables.</p>
        </section>

        <section class="mt-12" aria-labelledby="ubicacion">
          <h2 id="ubicacion" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Ubicación</h2>
          <p>Para indicar dónde es el trabajo podés elegir el barrio y escribir la dirección, o tocar "Usar mi ubicación".</p>
          <ul>
            <li>La ubicación del dispositivo se usa <strong>solo si la pedís y tu navegador te da permiso</strong>. Es una lectura puntual, sin seguimiento.</li>
            <li>Las coordenadas se usan únicamente para convertirlas en una dirección y sugerir el barrio, que siempre podés confirmar o cambiar. <strong>No guardamos coordenadas</strong> ni las mostramos.</li>
            <li>Lo que se guarda es el barrio y la dirección que confirmás, con las reglas de visibilidad de la sección anterior.</li>
          </ul>
        </section>

        <section class="mt-12" aria-labelledby="fotos">
          <h2 id="fotos" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Fotos, matrículas y documentos</h2>
          <h3>Foto de perfil y "Trabajos realizados" (públicas)</h3>
          <p>Las fotos que un profesional sube a su perfil son públicas. Al procesarlas quitamos los metadatos del archivo (como datos EXIF). El profesional puede borrarlas cuando quiera, y es responsable de no subir imágenes ni descripciones con datos de otras personas (caras, direcciones, patentes, teléfonos) sin su autorización.</p>
          <h3>Documentos de matrícula (privados)</h3>
          <p>Los documentos de verificación se utilizan únicamente para revisar la información profesional y no se muestran públicamente, salvo datos derivados como el estado "Matrícula verificada" cuando corresponde. La verificación se hace con el número de matrícula en el registro oficial; adjuntar el documento es opcional. Solo acceden las personas de Resuelve autorizadas para revisarlos, y el archivo puede eliminarse una vez tomada la decisión.</p>
        </section>

        <section class="mt-12" aria-labelledby="pagos">
          <h2 id="pagos" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Pagos de Resuelve PRO</h2>
          <p>Si contratás Resuelve PRO, el pago se hace en la página de Mercado Pago. Para crear y seguir la suscripción, Resuelve le envía a Mercado Pago tu email, una referencia interna, el importe y la descripción del plan, y recibe de Mercado Pago el estado de la suscripción y de cada cobro (aprobado, rechazado, fechas e importes).</p>
          <p><strong>Resuelve no recibe ni almacena números de tarjeta ni códigos de seguridad (CVV).</strong> Mercado Pago trata los datos del pago según sus propias políticas.</p>
        </section>

        <section class="mt-12" aria-labelledby="almacenamiento">
          <h2 id="almacenamiento" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Cookies y almacenamiento local</h2>
          <p><strong>Resuelve no usa cookies propias</strong> ni herramientas de analítica o publicidad de terceros. Sí usa el almacenamiento de tu navegador para que la aplicación funcione:</p>
          <ul>
            <li><strong>Almacenamiento local</strong> (queda en tu dispositivo hasta que lo borres): tu preferencia de tema claro, oscuro o del sistema y, para no insistir con "Instalá Resuelve", cuántas veces abriste la app, si ya la usaste y cuándo elegiste "Ahora no".</li>
            <li><strong>Caché de la aplicación</strong> (service worker): los archivos de la app (código, estilos, íconos y tipografías) para que abra más rápido y pueda mostrar "Sin conexión". No guarda tus datos, tus solicitudes ni respuestas del servidor.</li>
            <li><strong>Almacenamiento de sesión</strong> (se borra al cerrar la pestaña): la credencial que mantiene tu sesión iniciada, el borrador de la solicitud que estás armando, los profesionales que estás comparando, la clave aleatoria de las métricas anónimas (y qué perfiles ya se contaron) y qué avisos ya viste.</li>
          </ul>
          <p>Al cerrar sesión borramos la credencial de sesión. Podés borrar todo este almacenamiento desde la configuración de tu navegador.</p>
        </section>

        <section class="mt-12" aria-labelledby="conservacion">
          <h2 id="conservacion" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Cuánto tiempo conservamos los datos</h2>
          <p>Conservamos la información mientras la cuenta esté activa y durante el tiempo razonablemente necesario para las finalidades descritas, cumplir obligaciones, resolver disputas y proteger la seguridad del servicio.</p>
          <p>Algunos datos tienen reglas propias: tu dirección y tu teléfono dejan de compartirse con el profesional cuando el trabajo termina o se cancela, y las credenciales de sesión vencen y se reemplazan periódicamente. Cancelar Resuelve PRO o volver al plan Free no borra tu perfil, reseñas ni historial.</p>
        </section>

        <section class="mt-12" aria-labelledby="seguridad">
          <h2 id="seguridad" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Cómo protegemos los datos</h2>
          <p>Adoptamos medidas técnicas y organizativas razonables para proteger la información. Entre otras:</p>
          <ul>
            <li>Contraseñas guardadas con un algoritmo de hash moderno (Argon2id).</li>
            <li>Conexiones cifradas (HTTPS).</li>
            <li>Control de acceso en cada pedido: cada persona ve solo lo que le corresponde, y el panel de revisión de matrículas es solo para personas autorizadas.</li>
            <li>Documentos de matrícula en almacenamiento privado.</li>
            <li>Sesiones de corta duración y credenciales de sesión guardadas en forma de hash en el servidor.</li>
            <li>Registros técnicos sin contraseñas, tokens ni contenido de formularios, y límites de intentos para evitar abusos.</li>
          </ul>
          <p>Ningún sistema es completamente invulnerable, pero trabajamos para reducir los riesgos y revisamos estas medidas a medida que el servicio crece.</p>
        </section>

        <section class="mt-12" aria-labelledby="derechos">
          <h2 id="derechos" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Tus derechos</h2>
          <p>Podés pedirnos en cualquier momento:</p>
          <ul>
            <li><strong>Acceso:</strong> saber qué datos tuyos tenemos.</li>
            <li><strong>Rectificación y actualización:</strong> corregir datos inexactos o desactualizados. Tu perfil profesional y tus fotos los podés cambiar vos desde la aplicación.</li>
            <li><strong>Supresión:</strong> que eliminemos tus datos cuando corresponda.</li>
          </ul>
          <p>Estos derechos están previstos en la Ley 25.326 de Protección de Datos Personales.</p>
          <p>La <strong>Agencia de Acceso a la Información Pública (AAIP)</strong> es la autoridad de control en materia de protección de datos personales en Argentina. Si considerás que no respondimos adecuadamente, podés recurrir a ella: <a href="https://www.argentina.gob.ar/aaip/datospersonales" target="_blank" rel="noopener noreferrer">argentina.gob.ar/aaip/datospersonales<span class="sr-only"> (se abre en una pestaña nueva)</span></a>.</p>
        </section>

        <section class="mt-12" aria-labelledby="menores">
          <h2 id="menores" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Menores de edad</h2>
          <p>Resuelve es un servicio para contratar y ofrecer trabajos, y no está dirigido intencionalmente a menores de edad.</p>
        </section>

        <section class="mt-12" aria-labelledby="cambios">
          <h2 id="cambios" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Cambios en esta política</h2>
          <p>Podemos actualizar esta política para reflejar cambios del servicio o de nuestras prácticas. Vas a encontrar la fecha de la última actualización al principio de esta página.</p>
        </section>
      </article>

      @if (!embedded()) { <p class="mt-14 border-t border-line pt-6 text-[15px]">
        <a routerLink="/" class="font-semibold text-brand hover:underline">← Volver a Resuelve</a>
      </p> }
    </div>
  `,
})
export class PrivacyPage {
  readonly embedded = input(false);
  protected readonly sections = PRIVACY_SECTIONS;

  constructor() {
    const meta = inject(Meta);
    const previous = meta.getTag('name="description"')?.content ?? null;
    meta.updateTag({ name: 'description', content: DESCRIPTION });
    inject(DestroyRef).onDestroy(() => {
      if (previous) meta.updateTag({ name: 'description', content: previous });
    });
  }
}
