import { ChangeDetectionStrategy, Component, DestroyRef, inject, input } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { LEGAL_PAGE_STYLES } from './legal-page.styles';

/**
 * Versión vigente de los Términos. Tiene que coincidir con
 * `CURRENT_TERMS_VERSION` del backend (`backend/src/legal/terms.ts`), que la
 * guarda en la cuenta al registrarse. Cambio material → nueva fecha en ambos.
 */
export const TERMS_VERSION = '2026-10-08';
const TERMS_UPDATED_DATE = '2026-10-08';
const TERMS_UPDATED_LABEL = '7 de octubre de 2026';

/** Secciones con ancla: índice "En esta página" y enlaces directos (`/terminos#pro-pagos`). */
export const TERMS_SECTIONS = [
  { id: 'resumen', title: 'En pocas palabras' },
  { id: 'sobre', title: 'Sobre estos Términos' },
  { id: 'que-es', title: 'Qué es Resuelve y qué no hace' },
  { id: 'cuentas', title: 'Tu cuenta' },
  { id: 'clientes', title: 'Si pedís un servicio' },
  { id: 'profesionales', title: 'Si ofrecés servicios' },
  { id: 'trabajos', title: 'Solicitudes, presupuestos y trabajos' },
  { id: 'matriculas', title: 'Matrículas y verificaciones' },
  { id: 'resenas', title: 'Reseñas y calificación' },
  { id: 'contenido', title: 'Tu contenido y tus fotos' },
  { id: 'free', title: 'Plan Free' },
  { id: 'pro', title: 'Resuelve PRO' },
  { id: 'pro-pagos', title: 'Pago, renovación y cancelación de PRO' },
  { id: 'promociones', title: 'Promociones' },
  { id: 'uso', title: 'Uso aceptable' },
  { id: 'suspension', title: 'Pausa y suspensión de cuenta' },
  { id: 'propiedad', title: 'Propiedad intelectual' },
  { id: 'privacidad', title: 'Privacidad' },
  { id: 'responsabilidad', title: 'Disponibilidad y responsabilidad' },
  { id: 'cambios', title: 'Cambios en Resuelve y en estos Términos' },
  { id: 'ley', title: 'Ley aplicable y reclamos' },
] as const;

const DESCRIPTION =
  'Las reglas para usar Resuelve: qué hace la plataforma, qué se espera de clientes y profesionales, y cómo funcionan el plan Free y Resuelve PRO.';

/**
 * Términos de Uso públicos (`/terminos`, prerenderizada, sin login).
 * Describen SOLO lo que el código hace hoy (auditoría en el PR): Resuelve
 * intermedia, no presta el oficio ni cobra los trabajos; PRO se cobra con
 * Mercado Pago y cancelar = cancelar la renovación. Los datos del titular
 * fueron proporcionados por Resuelve. El contacto por email queda deshabilitado
 * hasta contar con una casilla oficial.
 */
// TODO: habilitar email de contacto cuando Resuelve tenga casilla oficial y documentar el canal de cierre de cuenta.
@Component({
  selector: 'app-terms-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: LEGAL_PAGE_STYLES,
  template: `
    <div class="mx-auto max-w-3xl animate-fade-in px-4 pt-6 pb-20 sm:px-5 lg:pt-12">
      @if (!embedded()) { <a routerLink="/" class="plain text-sm font-semibold text-brand hover:underline">← Volver a Resuelve</a> }

      <header class="mt-5">
        <p class="text-sm font-semibold tracking-[0.14em] text-brand uppercase">Legal</p>
        <h1 class="mt-2 font-display text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-ink md:text-[44px]">Términos de Uso</h1>
        <p class="mt-3 text-[15px] text-muted">Última actualización: <time [attr.datetime]="updatedDate">{{ updatedLabel }}</time></p>
      </header>

      <nav class="mt-8 border-y border-line py-5" aria-labelledby="toc-title">
        <h2 id="toc-title" class="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">En esta página</h2>
        <ol class="mt-3 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-2">
          @for (s of sections; track s.id) {
            <li>
              @if (embedded()) { <a [href]="'#' + s.id" class="plain inline-block py-0.5 font-medium text-brand hover:underline">{{ s.title }}</a> }
              @else { <a routerLink="/terminos" [fragment]="s.id" class="plain inline-block py-0.5 font-medium text-brand hover:underline">{{ s.title }}</a> }
            </li>
          }
        </ol>
      </nav>

      <article class="legal">
        <section class="mt-10" aria-labelledby="resumen">
          <h2 id="resumen" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">En pocas palabras</h2>
          <ul>
            <li>Resuelve te ayuda a encontrar profesionales en Tandil, pedir presupuestos, elegir y coordinar el trabajo. <strong>Resuelve no hace los trabajos</strong>: los hace el profesional que elegís.</li>
            <li>Cuando aceptás un presupuesto, el acuerdo por ese trabajo es entre vos y el profesional que elegiste. Resuelve no fija el precio, no cobra comisión y no procesa el pago del trabajo.</li>
            <li>Si sos profesional, usar Resuelve es gratis (plan Free, con tres oportunidades para responder solicitudes distintas después del trial). Resuelve PRO es una suscripción mensual opcional que se paga con Mercado Pago, se renueva sola y podés cancelar cuando quieras.</li>
            <li>"Matrícula verificada", "PRO", "Destacado" y la calificación son cosas distintas, y ninguna es una garantía sobre el trabajo.</li>
            <li>Nada de estos Términos limita derechos que la ley no permite limitar.</li>
          </ul>
        </section>

        <section class="mt-12" aria-labelledby="sobre">
          <h2 id="sobre" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Sobre estos Términos</h2>
          <p>Estos Términos de Uso regulan el uso de Resuelve, la plataforma que conecta a personas que necesitan un servicio con profesionales que lo ofrecen. Resuelve funciona hoy en Tandil, provincia de Buenos Aires, Argentina.</p>
          <p>El titular de Resuelve es Francisco Larrosa, CUIT 20-39550730-4, con domicilio en Tandil, Provincia de Buenos Aires, Argentina.</p>
          <p>Podés mirar Resuelve sin cuenta. <strong>Al crear una cuenta o usar las funciones que requieren cuenta, aceptás estos Términos.</strong> Guardamos qué versión aceptaste y cuándo. Si no estás de acuerdo, no crees una cuenta.</p>
          <h3>Algunas palabras que usamos</h3>
          <dl class="mt-2 flex flex-col gap-2">
            <div><dt class="inline">Cliente:</dt> <dd class="inline">quien publica o gestiona una solicitud.</dd></div>
            <div><dt class="inline">Profesional:</dt> <dd class="inline">quien ofrece sus servicios a través de Resuelve con un perfil profesional.</dd></div>
            <div><dt class="inline">Solicitud:</dt> <dd class="inline">el pedido de un servicio que crea un Cliente.</dd></div>
            <div><dt class="inline">Presupuesto:</dt> <dd class="inline">la propuesta económica que un Profesional envía para una solicitud.</dd></div>
            <div><dt class="inline">Trabajo:</dt> <dd class="inline">el servicio acordado entre el Cliente y el Profesional elegido.</dd></div>
            <div><dt class="inline">Resuelve PRO:</dt> <dd class="inline">la suscripción paga con herramientas y beneficios para Profesionales.</dd></div>
          </dl>
          <p>Una misma cuenta puede ser Cliente y también Profesional.</p>
        </section>

        <section class="mt-12" aria-labelledby="que-es">
          <h2 id="que-es" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Qué es Resuelve y qué no hace</h2>
          <p>Resuelve facilita el contacto y la gestión entre clientes y profesionales. Hoy permite:</p>
          <ul>
            <li>buscar y comparar profesionales por servicio y barrio, y ver sus perfiles públicos;</li>
            <li>enviar solicitudes a hasta seis profesionales y recibir sus presupuestos;</li>
            <li>aceptar un presupuesto y elegir al profesional;</li>
            <li>coordinar el horario del trabajo y seguirlo en la agenda;</li>
            <li>marcar el trabajo como realizado y dejar una reseña;</li>
            <li>para profesionales: armar su perfil, responder solicitudes, ver estadísticas de su actividad y, si quieren, contratar Resuelve PRO.</li>
          </ul>
          <p><strong>Resuelve no presta los servicios que se ofrecen en la plataforma.</strong> El trabajo lo hace el Profesional, que es quien acuerda con el Cliente el alcance, el precio, los materiales y la forma de pago. Resuelve no garantiza el resultado del trabajo, que un profesional responda, ni que un trabajo se concrete.</p>
          <p>Los profesionales actúan de forma independiente. Usar Resuelve no crea por sí mismo una relación laboral, sociedad, representación, mandato ni franquicia entre Resuelve y los profesionales, ni entre Resuelve y los clientes. Esto no excluye las relaciones jurídicas que pudieran surgir de los hechos concretos.</p>
        </section>

        <section class="mt-12" aria-labelledby="cuentas">
          <h2 id="cuentas" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Tu cuenta</h2>
          <ul>
            <li>Cargá información verdadera y mantenela actualizada, en especial tu nombre y tu teléfono si lo usás para coordinar trabajos.</li>
            <li>La cuenta es personal: no uses la identidad de otra persona ni crees cuentas a nombre de terceros.</li>
            <li>Cuidá tu contraseña y no la compartas. Si creés que alguien entró a tu cuenta, avisanos.</li>
            <li>Sos responsable de lo que se haga desde tu cuenta, salvo que se deba a una falla de Resuelve o a un acceso que no pudiste evitar.</li>
          </ul>
          <p>Podés <strong>eliminar tu cuenta</strong> cuando quieras desde tu perfil → <strong>Eliminar cuenta</strong>. Para hacerlo no tenés que tener trabajos en curso con otra persona ni una suscripción a PRO activa (cancelala antes en Mi plan). La baja es definitiva: se borran tus datos personales y, para el resto de las personas, pasás a ser "Usuario eliminado"; los trabajos y reseñas que compartiste se conservan sin tus datos. Podés crear otra cuenta con el mismo email.</p>
          <p>Hoy Resuelve no verifica el email al crear la cuenta, así que no todas las cuentas tienen el email confirmado.</p>
          <p>Para usar Resuelve tenés que contar con capacidad legal suficiente para realizar las contrataciones y los actos que lleves adelante mediante la plataforma.</p>
        </section>

        <section class="mt-12" aria-labelledby="clientes">
          <h2 id="clientes" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Si pedís un servicio</h2>
          <ul>
            <li>Describí lo que necesitás con razonable precisión y dá la información necesaria para que el profesional pueda presupuestar y hacer el trabajo.</li>
            <li>Respetá lo que acordás: el presupuesto que aceptás, el horario que confirmás y el pago que corresponda al profesional.</li>
            <li>Tratá a los profesionales con respeto. No uses Resuelve para fraude, acoso ni actividades ilegales.</li>
            <li>Si algo cambia, avisale al profesional cuanto antes y usá las opciones de la aplicación (pedir otro horario, cancelar la solicitud).</li>
          </ul>
        </section>

        <section class="mt-12" aria-labelledby="profesionales">
          <h2 id="profesionales" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Si ofrecés servicios</h2>
          <ul>
            <li>Describí tus servicios, tu experiencia y tu zona de trabajo de forma veraz.</li>
            <li>Enviá presupuestos de buena fe y respetá los trabajos que te aceptan y los horarios que confirmás.</li>
            <li>Cumplí las normas de tu oficio y contá con las matrículas, habilitaciones y seguros que la ley exija para lo que ofrecés.</li>
            <li>Mantené tus datos al día: servicios, barrios, "Disponible hoy" y si tu perfil está activo o pausado.</li>
            <li>No subas fotos de trabajos que no hiciste ni información engañosa.</li>
          </ul>
          <p>Cada Profesional es responsable de evaluar y cumplir las obligaciones fiscales, impositivas, laborales, previsionales, de facturación y de habilitación que correspondan a su actividad. Resuelve no brinda asesoramiento sobre estos temas.</p>
          <p>"Disponible hoy" es algo que el Profesional declara y vence a la medianoche. No garantiza una respuesta inmediata.</p>
        </section>

        <section class="mt-12" aria-labelledby="trabajos">
          <h2 id="trabajos" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Solicitudes, presupuestos y trabajos</h2>
          <h3>Presupuestos</h3>
          <p>Cada Profesional define su presupuesto; Resuelve no fija el precio del trabajo. <strong>Cuando aceptás un presupuesto, el acuerdo por ese trabajo es entre vos y el profesional que elegiste.</strong> Cualquier cambio posterior (alcance, materiales, precio) lo tienen que acordar entre ustedes. Aceptar un presupuesto no genera ningún cargo de Resuelve.</p>
          <h3>Pago del trabajo</h3>
          <p><strong>Resuelve no procesa actualmente el pago del servicio contratado entre Cliente y Profesional</strong> ni cobra comisión por él. El pago se acuerda y se hace directamente entre ustedes. No confundas este pago con la suscripción Resuelve PRO, que es un servicio de Resuelve para profesionales.</p>
          <h3>Ubicación y datos de contacto</h3>
          <p>Los profesionales que reciben tu solicitud ven el servicio, la descripción y el barrio, pero no tu dirección exacta ni tu teléfono. Esos datos se comparten solo con el profesional que elegiste, mientras el trabajo está en curso, para que puedan coordinar. El detalle está en la <a routerLink="/privacidad">Política de Privacidad</a>.</p>
          <h3>Agenda</h3>
          <p>El profesional elegido propone un horario y el cliente lo confirma o pide otro. La agenda sirve para coordinar: no garantiza que alguna de las partes se presente. Ambas partes deben respetar el horario confirmado y, si necesitan cambiarlo, reprogramarlo desde la aplicación o avisarse a tiempo.</p>
          <h3>Trabajo realizado</h3>
          <p>Terminado el horario confirmado, el cliente o el profesional pueden marcar el trabajo como realizado. Eso cierra el trabajo en Resuelve y habilita la reseña y las estadísticas; no es una certificación de Resuelve sobre la calidad técnica del trabajo.</p>
          <h3>Urgencias</h3>
          <p>La sección Urgencias sirve para encontrar rápido a un profesional que marcó que puede trabajar hoy. <strong>No es un servicio de emergencias.</strong> Si hay riesgo para personas, un incendio, una fuga peligrosa u otra emergencia, contactá primero a los servicios de emergencia correspondientes (por ejemplo, el 911).</p>
          <h3>Seguridad en trabajos presenciales</h3>
          <ul>
            <li>Antes del trabajo, confirmá con la otra parte los datos importantes: quién va, cuándo y qué se va a hacer.</li>
            <li>No compartas más información personal de la necesaria.</li>
            <li>Desconfiá de pedidos de pago o acuerdos inusuales, como adelantos que no corresponden al trabajo.</li>
            <li>Si algo te hace sentir inseguro, no sigas adelante y, si hace falta, contactá a las autoridades.</li>
          </ul>
        </section>

        <section class="mt-12" aria-labelledby="matriculas">
          <h2 id="matriculas" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Matrículas y verificaciones</h2>
          <p>En determinados servicios, Resuelve puede exigir que el Profesional acredite una matrícula o habilitación antes de ofrecerlos en la plataforma. Mientras no esté verificada, ese servicio no se publica.</p>
          <p>"Matrícula verificada" significa que una persona de Resuelve revisó el número de matrícula que cargó el Profesional en el registro oficial que corresponde y lo encontró vigente a su nombre en ese momento. <strong>No es una recomendación personal ni una garantía sobre la calidad, la seguridad o el resultado del trabajo.</strong> Una matrícula puede vencer o cambiar después de la revisión.</p>
          <p>Cargar datos o documentos falsos o adulterados es motivo de rechazo y puede llevar a la suspensión de la cuenta.</p>
        </section>

        <section class="mt-12" aria-labelledby="resenas">
          <h2 id="resenas" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Reseñas y calificación</h2>
          <p>El cliente puede dejar una reseña (de 1 a 5 estrellas, con un comentario opcional) por cada trabajo marcado como realizado, sobre el profesional que eligió. Las reseñas deben reflejar una experiencia genuina y no pueden incluir amenazas, insultos, discriminación, datos personales innecesarios, spam ni contenido ilegal. No se permite ofrecer ni pedir algo a cambio de una reseña, ni reseñarse a uno mismo.</p>
          <p>Hoy las reseñas se publican sin revisión previa. Cualquier persona con cuenta puede reportar una reseña desde el perfil del profesional; una persona de Resuelve la revisa y, si infringe estos Términos, la oculta (la reseña ocultada deja de mostrarse y de contar en la calificación). Un profesional no puede borrar las reseñas que recibe: solo reportarlas. Resuelve puede además ocultar o eliminar las que infrinjan estos Términos por su cuenta.</p>
          <p>Además, un profesional puede invitar a sus clientes, con un enlace o un código QR, a dejar una reseña de un trabajo que hicieron fuera de Resuelve. No hace falta una cuenta: alcanza con el nombre y un correo electrónico, que no se muestra a nadie y se usa solo para evitar reseñas repetidas (una por persona y profesional); Resuelve no verifica que el correo sea de quien reseña. Como Resuelve no puede comprobar que ese trabajo existió, estas reseñas se muestran aparte, rotuladas como de «cliente invitado por el profesional», y no cuentan en la calificación del profesional ni en el orden de las búsquedas. Las reglas de contenido y de manipulación valen igual para ellas.</p>
          <p>La calificación de un profesional es el promedio de las reseñas de los trabajos realizados por Resuelve. Es una referencia de otros usuarios, no una certificación profesional ni una garantía.</p>
        </section>

        <section class="mt-12" aria-labelledby="contenido">
          <h2 id="contenido" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Tu contenido y tus fotos</h2>
          <p>Los profesionales pueden subir una foto de perfil y fotos de "Trabajos realizados" con una descripción breve: hasta 5 activas en Free y hasta 20 en PRO. Solo subí fotos:</p>
          <ul>
            <li>de trabajos que hiciste y que tenés derecho a usar;</li>
            <li>que no muestren personas, direcciones, patentes, documentos ni otros datos de tus clientes o de terceros sin su autorización;</li>
            <li>que no sean engañosas ni infrinjan derechos de autor.</li>
          </ul>
          <p><strong>Seguís siendo titular de tu contenido</strong> (textos, fotos, reseñas). Para que Resuelve pueda funcionar, nos das una licencia no exclusiva, gratuita y limitada para alojarlo, adaptarlo técnicamente (por ejemplo, recortar o comprimir una foto) y mostrarlo dentro de Resuelve, en la medida y en los lugares técnicamente necesarios. Esa licencia se usa solo para operar y mostrar Resuelve y termina cuando borrás el contenido o se elimina tu cuenta, salvo las copias técnicas que tarden un tiempo razonable en eliminarse o lo que debamos conservar por ley. Las reseñas publicadas pueden seguir visibles en el perfil del profesional.</p>
        </section>

        <section class="mt-12" aria-labelledby="free">
          <h2 id="free" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Plan Free</h2>
          <p>Crear un perfil profesional y usar el plan Free es gratis. Con Free:</p>
          <ul>
            <li>recibís y ves solicitudes sin límite;</li>
            <li>después del trial de primer éxito, podés responder con presupuesto hasta <strong>tres oportunidades discovery distintas en total</strong>. Las solicitudes dirigidas a un profesional no consumen este cupo; editar o volver a presupuestar una solicitud ya respondida tampoco suma otra oportunidad.</li>
          </ul>
          <p>El límite vigente lo ves siempre en la sección Plan y en tu panel.</p>
        </section>

        <section class="mt-12" aria-labelledby="pro">
          <h2 id="pro" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Resuelve PRO</h2>
          <p>Las invitaciones entre profesionales otorgan acceso PRO de cortesía a los dos cuando una cuenta creada con el enlace de invitación crea su perfil profesional (con al menos un servicio y la zona donde trabaja). Registrarse sin crear el perfil no alcanza. La recompensa vigente (cantidad de días) se informa en Mi Plan; se aplica una vez por invitación válida, sin dinero ni cobros nuevos. Quien invita suma días por una cantidad limitada de invitaciones, también informada en Mi Plan; después, la persona invitada igual recibe los suyos. No se permiten autoinvitaciones ni agregar un referente después de crear la cuenta. Si tenés una suscripción paga, la recompensa no cambia su renovación ni sus cobros; prolonga el acceso efectivo por el plazo otorgado.</p>
          <p>Resuelve PRO es una suscripción mensual opcional para profesionales. <strong>El precio vigente es el que ves en la sección Plan antes de contratar</strong>; Resuelve puede cambiarlo y el cambio rige para las suscripciones nuevas. Hoy incluye:</p>
          <ul>
            <li>presupuestos sin límite;</li>
            <li>la insignia "PRO" en tu perfil;</li>
            <li>la posibilidad de aparecer en espacios "Destacado" de los resultados de búsqueda;</li>
            <li>estadísticas avanzadas en "Tu mes", incluidas métricas de exposición de tu perfil.</li>
          </ul>
          <p><strong>PRO no garantiza recibir solicitudes, ser contratado, facturar un monto determinado ni aparecer siempre en posiciones destacadas.</strong></p>
          <h3>Destacados</h3>
          <p>"Destacado" es un espacio de promoción que forma parte de Resuelve PRO: siempre se muestra rotulado, hay una cantidad limitada de espacios y rota día a día, y según la búsqueda, entre los profesionales PRO que cumplen el servicio, el barrio y la matrícula buscados (por eso un perfil PRO no aparece como destacado en todas las búsquedas), y no desplaza a los demás de los resultados. No es una recomendación de Resuelve, ni una certificación, ni significa mayor calidad. Es distinto de "PRO", de "Matrícula verificada" y de la calificación.</p>
          <h3>Tu mes y estadísticas</h3>
          <p>Las estadísticas de "Tu mes" son informativas: se calculan con tu actividad en Resuelve y pueden estar sujetas a demoras, deduplicación y ajustes técnicos. No son una certificación contable ni fiscal. En particular, el "valor de presupuestos aceptados" es la suma de los presupuestos que te aceptaron en Resuelve y no representa necesariamente lo que efectivamente cobraste.</p>
        </section>

        <section class="mt-12" aria-labelledby="pro-pagos">
          <h2 id="pro-pagos" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Pago, renovación y cancelación de PRO</h2>
          <h3>Mercado Pago</h3>
          <p>La suscripción se contrata y se cobra a través de Mercado Pago, que administra el medio de pago según sus propios términos y políticas. <strong>Resuelve no recibe ni almacena el número completo de tu tarjeta ni el código de seguridad (CVV).</strong> Si querés cambiar la tarjeta, lo hacés desde tu cuenta de Mercado Pago. El detalle de cada cobro lo ves en Mercado Pago; hoy Resuelve no emite comprobantes desde la aplicación.</p>
          <p>Volver de Mercado Pago no activa PRO por sí solo: PRO se activa cuando Mercado Pago confirma la suscripción.</p>
          <h3>Renovación automática</h3>
          <p><strong>PRO es mensual y se renueva automáticamente cada mes, al precio vigente, hasta que lo canceles.</strong></p>
          <h3>Cambios de precio</h3>
          <p>Los cambios de precio aplicables a renovaciones futuras se van a comunicar de manera clara antes de que resulten aplicables, respetando los derechos que correspondan. Un cambio de precio nunca modifica un período que ya pagaste.</p>
          <h3>Si un cobro no se puede procesar</h3>
          <p>Si Mercado Pago no puede cobrar una renovación, mantenemos tu acceso PRO durante un período de gracia (hoy, 10 días) mientras Mercado Pago reintenta el cobro. Si no se regulariza en ese plazo, los beneficios PRO se suspenden y volvés a Free hasta que se apruebe un cobro.</p>
          <h3>Cancelar la suscripción</h3>
          <p>Podés cancelar cuando quieras desde <strong>Mi plan → Dejar de renovar</strong>. Cancelar significa que <strong>no se renueva más</strong>: conservás PRO hasta el final del período que ya pagaste y, después de esa fecha, pasás a Free. La aplicación te muestra hasta cuándo seguís con PRO.</p>
          <p>Volver a Free, por cancelación o por falta de pago, no borra tu perfil, tus reseñas, tu agenda ni tu historial: solo dejás de tener los beneficios PRO. Cancelar PRO tampoco elimina tu cuenta.</p>
          <h3>Derecho de arrepentimiento</h3>
          <p>Cancelar la renovación no es lo mismo que arrepentirse de la contratación. Podés revocar la contratación de PRO dentro de los <strong>10 días corridos</strong> siguientes a contratarla, sin costo y sin tener que explicar el motivo, desde <strong>Mi plan → Botón de arrepentimiento</strong>, mientras el plazo corre. Al revocar, cancelamos la suscripción, quitamos PRO en el momento (volvés a Free) y te devolvemos lo que pagaste por el mismo medio de pago, a través de Mercado Pago. Estos Términos no limitan ese derecho.</p>
          <h3>Reembolsos</h3>
          <p>Si ejercés el arrepentimiento, el reembolso es automático y por el total cobrado; Mercado Pago puede demorar unos días en acreditarlo. Fuera de ese caso, Resuelve no hace reembolsos automáticos: los pedidos de reembolso, cuando correspondan legalmente o por las condiciones de una promoción, se evalúan según el caso y la normativa aplicable. Una promoción ya usada no se vuelve a ofrecer por haber revocado.</p>
        </section>

        <section class="mt-12" aria-labelledby="promociones">
          <h2 id="promociones" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Promociones</h2>
          <p>Resuelve puede ofrecer promociones a algunos profesionales. Hoy existe la <strong>oferta de bienvenida de 20% OFF en el primer mes</strong> de PRO: <strong>pagás el primer mes con el descuento y luego el precio vigente por mes</strong>. Se ofrece a profesionales en Free que nunca pagaron PRO y ya usaron buena parte de sus oportunidades Free totales, se aplica una sola vez por profesional y se consume con el primer cobro aprobado. Antes de contratar ves si te corresponde y el precio de los meses siguientes.</p>
          <p>No se permite crear varias cuentas o perfiles para volver a usar una promoción. Las promociones futuras pueden tener otras condiciones, que se informan en cada caso.</p>
        </section>

        <section class="mt-12" aria-labelledby="uso">
          <h2 id="uso" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Uso aceptable</h2>
          <p>No está permitido publicar ni enviar a través de Resuelve contenido:</p>
          <ul>
            <li>ilegal, fraudulento, discriminatorio, amenazante o de acoso;</li>
            <li>sexual explícito;</li>
            <li>con datos personales de terceros sin su autorización;</li>
            <li>que suplante a otra persona, o fotos de trabajos que no son tuyos;</li>
            <li>documentos adulterados o reseñas manipuladas;</li>
            <li>spam, publicidad no relacionada o software malicioso.</li>
          </ul>
          <p>Tampoco está permitido:</p>
          <ul>
            <li>acceder a cuentas ajenas o a datos que no te corresponden;</li>
            <li>atacar, sobrecargar o intentar vulnerar Resuelve o abusar de su API;</li>
            <li>extraer datos de forma masiva o automatizada sin autorización;</li>
            <li>eludir límites (como el cupo de Free) o manipular la búsqueda, los destacados, las reseñas o las estadísticas;</li>
            <li>descompilar o hacer ingeniería inversa del software, salvo en la medida en que la ley lo permita.</li>
          </ul>
        </section>

        <section class="mt-12" aria-labelledby="suspension">
          <h2 id="suspension" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Pausa y suspensión de cuenta</h2>
          <h3>Pausar tu perfil profesional</h3>
          <p>Como profesional, podés pausar tu perfil cuando quieras: deja de aparecer en búsquedas y de recibir solicitudes nuevas, sin perder tu historial. Lo reactivás cuando quieras. Es una decisión tuya y no es una sanción.</p>
          <h3>Suspensión por parte de Resuelve</h3>
          <p>Resuelve puede restringir o suspender una cuenta, un perfil o un contenido ante fraude, identidad falsa, documentos adulterados, manipulación de reseñas, amenazas o acoso, spam, abuso técnico, actividad ilegal o incumplimientos graves o reiterados de estos Términos. La medida va a ser proporcional al caso. Cuando sea razonable y no lo impida la ley o la seguridad de otras personas, te vamos a informar el motivo y vas a poder solicitar que se revise.</p>
        </section>

        <section class="mt-12" aria-labelledby="propiedad">
          <h2 id="propiedad" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Propiedad intelectual</h2>
          <p>La marca Resuelve, su logo, su diseño, sus textos propios y su software pertenecen a su titular. Usar Resuelve te da permiso para usar la plataforma de forma normal, pero no te transfiere derechos sobre esos elementos. El contenido que suben los usuarios es de quienes lo suben (ver "Tu contenido y tus fotos").</p>
        </section>

        <section class="mt-12" aria-labelledby="privacidad">
          <h2 id="privacidad" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Privacidad</h2>
          <p>Cómo tratamos tus datos, qué es público, qué ve cada parte y cómo ejercer tus derechos está en la <a routerLink="/privacidad">Política de Privacidad</a>, que forma parte de las condiciones de uso de Resuelve.</p>
          <p>Resuelve te muestra avisos operativos dentro de la aplicación (solicitudes nuevas, presupuestos, cambios de horario). Aceptar estos Términos no implica aceptar comunicaciones de marketing: hoy Resuelve no envía newsletters ni promociones por email.</p>
          <p>Para funcionar, Resuelve usa proveedores externos, como Mercado Pago (cobro de PRO), Cloudinary (imágenes) y servicios de alojamiento. El detalle está en la Política de Privacidad.</p>
        </section>

        <section class="mt-12" aria-labelledby="responsabilidad">
          <h2 id="responsabilidad" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Disponibilidad y responsabilidad</h2>
          <p>Hacemos lo razonable para que Resuelve funcione bien, pero no podemos garantizar que esté disponible siempre ni libre de errores: puede haber mantenimiento, fallas, caídas de proveedores externos, interrupciones o casos de fuerza mayor.</p>
          <p>Resuelve responde por lo que le corresponde como plataforma: el funcionamiento de sus herramientas, el cuidado de tus datos y la prestación de Resuelve PRO a quien lo contrata. El trabajo lo realiza el profesional de forma independiente, y la forma en que lo haga, así como los actos de otros usuarios, no son obra de Resuelve.</p>
          <p><strong>Nada de estos Términos limita derechos o responsabilidades que no puedan excluirse legalmente</strong>, incluidos los derechos que te reconozcan las normas de defensa del consumidor cuando sean aplicables.</p>
        </section>

        <section class="mt-12" aria-labelledby="cambios">
          <h2 id="cambios" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Cambios en Resuelve y en estos Términos</h2>
          <p>Podemos modificar funcionalidades para mejorar o mantener Resuelve, y ajustar los beneficios futuros de Free y PRO. Si un cambio afecta materialmente una suscripción paga vigente, lo vamos a comunicar de forma adecuada, y nunca cambia retroactivamente el precio o las condiciones de un período ya pagado.</p>
          <p>También podemos actualizar estos Términos. Arriba vas a ver la fecha de la última actualización. Si el cambio es importante, lo vamos a comunicar de forma razonable antes de que se aplique.</p>
        </section>

        <section class="mt-12" aria-labelledby="ley">
          <h2 id="ley" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Ley aplicable y reclamos</h2>
          <p>Estos Términos se rigen por las leyes de la República Argentina, sin perjuicio de las normas imperativas y reglas de jurisdicción que resulten aplicables.</p>
          <p>Podés acudir a los organismos de defensa del consumidor o a la justicia cuando te corresponda.</p>
        </section>
      </article>

      @if (!embedded()) { <p class="mt-14 border-t border-line pt-6 text-[15px]">
        <a routerLink="/" class="font-semibold text-brand hover:underline">← Volver a Resuelve</a>
      </p> }
    </div>
  `,
})
export class TermsPage {
  readonly embedded = input(false);
  protected readonly sections = TERMS_SECTIONS;
  protected readonly updatedDate = TERMS_UPDATED_DATE;
  protected readonly updatedLabel = TERMS_UPDATED_LABEL;

  constructor() {
    const meta = inject(Meta);
    const previous = meta.getTag('name="description"')?.content ?? null;
    meta.updateTag({ name: 'description', content: DESCRIPTION });
    inject(DestroyRef).onDestroy(() => {
      if (previous) meta.updateTag({ name: 'description', content: previous });
    });
  }
}
