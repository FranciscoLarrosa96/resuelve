# Plan técnico: avisos por WhatsApp

Estado: propuesta. Nada de esto está implementado. Costos y tarifas: ver la conversación del 6 de octubre de 2026 (utilidad ≈ US$ 0,026 por mensaje entregado en Argentina; confirmar en la tarifa oficial de Meta).

## 1. Objetivo y alcance

Hoy los avisos son solo dentro de la app (campanita, polling de 60 s). Un profesional que no tiene la app abierta no se entera de una solicitud, y en una urgencia eso es perder el trabajo.

**Fase 1 (MVP):** avisar por WhatsApp **al profesional** cuando recibe una solicitud **urgente** o **dirigida a él**. Nada más.

**Fuera de alcance de la fase 1:** mensajes de marketing, chat bidireccional, avisos al cliente, solicitudes no urgentes.

## 2. Qué ya existe y lo que condiciona el diseño

- `notify()` (`backend/src/notifications/notify.ts`) es el **único punto** donde nace un aviso, dentro de la transacción de la acción, con `dedupe_key` único y sin avisar a quien actúa. Los tipos útiles: `PRO_REQUEST_RECEIVED` y `PRO_TARGETED_REQUEST_RECEIVED` (creados en `requests.service.ts` al invitar).
- Cada notificación tiene `availableAt`: a un profesional Free la oportunidad le aparece recién a los 30 minutos (ventana de ventaja PRO). **El WhatsApp tiene que respetarla**: se envía cuando el aviso pasa a estar disponible, no cuando se crea.
- `users.phone` es opcional y de formato libre; `phoneVerified` existe pero **nadie lo verifica de verdad** (solo el seed lo marca). No se puede confiar en ese número ni asumir que dio consentimiento.
- Patrón de proveedor + fake + webhook firmado ya probado en billing (`BillingProvider`, `FakeBillingProvider`, `WebhookSignatureValidator`). Se repite.
- Patrón de job periódico: `BillingScheduler` (`setInterval` con guarda `running`, apagado en tests).
- **Riesgo de hosting:** el backend corre en Render, y el README dice que Render Free bloquea SMTP, lo que sugiere plan gratuito. Un servicio gratuito se duerme y los timers no corren dormido. Una urgencia no puede depender de un timer. Ver 4.3.

## 3. Principios

1. **El mensaje no lleva datos personales.** Ni dirección, ni teléfono, ni apellido del cliente. Solo "tenés una solicitud de X en el barrio Y" + enlace. Mismo criterio de privacidad que hoy (el invitado ve barrio y descripción; el elegido ve el resto).
2. **Consentimiento explícito y verificable** antes del primer mensaje, con baja fácil.
3. **El número se verifica con WhatsApp mismo**: un código de verificación enviado por WhatsApp prueba que el número es del profesional y que lo usa. Cuesta un mensaje de autenticación (≈ US$ 0,026) por profesional, una vez.
4. **La app sigue siendo la fuente de verdad.** WhatsApp es un aviso; el enlace lleva a la solicitud real (requiere login). Si WhatsApp falla, nada se rompe: la campanita sigue.
5. **Tope de gasto en el código**, no en la esperanza.
6. **Idempotente:** una notificación genera como máximo un envío, aunque se reintente o haya dos instancias.

## 4. Arquitectura

### 4.1 Proveedor (como billing)

`backend/src/whatsapp/`

- `whatsapp-provider.ts`: contrato `WhatsAppProvider { sendTemplate(to, template, params, buttonParam) ; configured }`.
- `MetaCloudWhatsAppProvider`: `fetch` propio a la Graph API (timeout, **reintento solo ante error de red/5xx y solo con idempotencia propia**: no se reenvía un mensaje que ya devolvió id).
- `FakeWhatsAppProvider`: en memoria, para tests, dev y Playwright. La env impide el proveedor real en tests.
- `WHATSAPP_PROVIDER=none|meta|fake` (default `none`: sin configuración no se envía nada y la app funciona igual).

### 4.2 Datos (migraciones nuevas; probar apply → revert → apply)

- `whatsapp_contacts`: `user_id` (PK), `phone_e164`, `verified_at`, `opted_in_at`, `opted_out_at`, `opt_out_source` (`APP` | `WHATSAPP_REPLY` | `PROVIDER`). Un número verificado por usuario; índice único parcial en `phone_e164` verificado (un número no sirve a dos cuentas).
- `whatsapp_verifications`: `user_id`, `code_hash`, `expires_at`, `attempts`, `created_at`. Código de 6 dígitos hasheado, vence en 10 minutos, máximo 5 intentos, 1 envío por minuto y 5 por día.
- `whatsapp_deliveries`: `id`, `notification_id` (**único**), `user_id`, `template`, `status` (`QUEUED | SENT | DELIVERED | READ | FAILED | SKIPPED`), `skip_reason`, `provider_message_id` (único), `error_code`, `queued_at`, `sent_at`, `delivered_at`, `read_at`, `failed_at`. Sin cuerpo del mensaje ni teléfono (el teléfono vive solo en `whatsapp_contacts`).

El texto de la plantilla se arma en el servidor por tipo, igual que el frontend arma el de la campanita: la base guarda referencias, no contenido.

### 4.3 Despachador (el corazón)

No toca `notify()`. Lee `notifications` ya creadas:

- Candidatas: tipo ∈ `WHATSAPP_TYPES`, audiencia profesional, `availableAt` nulo o pasado, `read_at` nulo (si ya lo vio en la app, no se manda), sin fila en `whatsapp_deliveries`, y el usuario tiene contacto verificado + opt-in vigente.
- Urgente: se resuelve por `request.urgency = URGENT`; dirigida: por el tipo.
- Se reclama con `INSERT … ON CONFLICT (notification_id) DO NOTHING` + `FOR UPDATE SKIP LOCKED`: dos instancias no envían dos veces.
- Antes de enviar revalida: tope diario por profesional, tope global del mes, ventana horaria (no mandar de madrugada una solicitud no urgente; las urgentes salen siempre), solicitud todavía abierta y el profesional no la respondió.
- Si el proveedor falla de forma transitoria: reintenta con espera creciente, máximo 3 veces, y después `FAILED`. Un fallo permanente (número inválido, usuario que bloqueó) marca `SKIPPED` y apaga el contacto.

**Cuándo corre:**
1. **Inmediato, después del commit** de la transacción que crea la solicitud: un `dispatchSoon()` en el mismo proceso. Cubre la urgencia sin depender de ningún timer, porque la request del cliente está viva.
2. **Barrido periódico** (cada 1 minuto, con guarda `running`, apagado en tests): recoge lo que se liberó por `availableAt` (Free a los 30 min), los reintentos y lo que quedó colgado si el proceso murió.

Si el hosting se duerme, el barrido se atrasa. Para el mensaje urgente al profesional no importa (sale en el paso 1); para el "liberado a los 30 minutos" sí. Con un plan que no duerme el problema desaparece. Es una decisión de infraestructura que **no tomo yo** (no toco la configuración de Render).

### 4.4 Webhook de Meta

`POST /webhooks/whatsapp` (sin JWT, sin throttle, fuera de Swagger) y `GET` para el desafío de verificación (`hub.challenge`).

- **Firma obligatoria:** `X-Hub-Signature-256` = HMAC-SHA256 del body crudo con el *app secret*; comparación en tiempo constante; falla → 401 sin tocar nada. Mismo estilo que el webhook de Mercado Pago.
- Estados de mensaje (`sent`, `delivered`, `read`, `failed`) actualizan `whatsapp_deliveries`. Un estado viejo no degrada a uno nuevo (orden: `SENT < DELIVERED < READ`). Idempotente.
- Mensajes entrantes: si el texto es "BAJA", "STOP" o equivalente, se marca `opted_out_at` y se confirma. Cualquier otra respuesta abre la ventana de 24 horas (los mensajes de servicio dentro de ella son gratis hasta el tope mensual) pero **no se procesa como comando**.
- Un fallo de procesamiento responde 500 para que Meta reintente.

### 4.5 Plantillas (todas de categoría *utilidad*; sin tono promocional)

Meta las aprueba antes de usarlas, normalmente entre unos minutos y un día. Si les ve tono de marketing las reclasifica y el costo sube 2,4 veces.

| Plantilla | Texto propuesto | Botón |
|---|---|---|
| `solicitud_urgente` | "Hola {{1}}, tenés una solicitud urgente de {{2}} en {{3}}. Mirala y mandá tu presupuesto." | "Ver solicitud" → `https://resuelve.com.ar/pro/solicitudes/{{id}}` |
| `solicitud_dirigida` | "Hola {{1}}, un cliente te pidió presupuesto de {{2}} en {{3}}." | idem |
| `codigo_verificacion` | Plantilla de autenticación estándar de Meta (código de un solo uso). | copiar código |

`{{1}}` = nombre de pila, `{{2}}` = servicio, `{{3}}` = barrio. Nunca apellido, dirección ni teléfono.

## 5. Experiencia del profesional

1. **Mi perfil → Avisos por WhatsApp** (y un aviso discreto en el panel cuando recibe su primera solicitud): "Recibí las solicitudes urgentes en tu WhatsApp".
2. Pide el número (formato argentino, normalizado a E.164) y explica en una línea qué va a recibir, cuánto, y que se puede apagar.
3. Le llega el código por WhatsApp, lo ingresa, y ahí queda verificado **y** con consentimiento registrado (fecha, texto mostrado, versión).
4. Siempre puede apagarlo desde la app, respondiendo "BAJA" o bloqueando el número; en los tres casos se respeta de inmediato.
5. El estado se ve con claridad: "Activo", "Pausado" o "Sin verificar". Nada de datos inventados: si un mensaje falló, se dice.

Interfaz: pantalla mobile primero (el 97 % de uso es en celular), campos con teclado numérico, botones de 44 px como mínimo, estados con `aria-live`.

## 6. Límites y control de costo

Todo configurable por env, con defaults conservadores:

- `WHATSAPP_TYPES` (default: urgente + dirigida).
- `WHATSAPP_DAILY_LIMIT_PER_PRO` (default 5).
- `WHATSAPP_MONTHLY_MESSAGE_CAP` (corte global): al llegar al 80 % se loguea una alerta; al 100 % se deja de enviar (la campanita sigue). Cuenta también los códigos de verificación.
- Un mensaje por solicitud por profesional; editar o repetir una notificación no reenvía.
- Un solo intento de código por minuto y 5 por día por usuario (evita que alguien dispare mensajes a números ajenos con nuestro costo).

## 7. Privacidad y legal

- **Política de Privacidad:** agregar WhatsApp / Meta como proveedor (recibe el número, el nombre de pila, el servicio y el barrio de la solicitud, y el estado del mensaje), la base legal (consentimiento), la baja y la conservación. Subir la fecha de la política.
- **Términos de Uso:** mencionar que los avisos por WhatsApp son opcionales y no reemplazan revisar la app.
- Registro del consentimiento: fecha, versión del texto y canal.
- El teléfono se guarda solo en `whatsapp_contacts`; no entra en ningún endpoint público ni en logs.
- Baja de cuenta: borra `whatsapp_contacts`; las entregas conservan solo ids de notificación (sin teléfono).

## 8. Pruebas

- Unitarias: normalización de teléfono argentino (formatos con 0, 15, +54, +549), reglas del despachador (tope diario, leído, abierta, `availableAt`), orden de estados, firma del webhook.
- E2E con `FakeWhatsAppProvider`: alta con código correcto/incorrecto/vencido/demasiados intentos; solicitud urgente a profesional con opt-in envía una vez; sin opt-in no envía; Free respeta `availableAt`; doble disparo o dos instancias no duplican; "BAJA" apaga; webhook con firma inválida 401; estado `READ` no vuelve a `SENT`; tope mensual corta.
- Playwright a 1440, 1024 y 390 con axe limpio, consola limpia y sin scroll horizontal.
- Prueba manual con un número real en el entorno de pruebas de Meta antes de producción.

## 9. Fases

| Fase | Contenido | Dependencias |
|---|---|---|
| **0 · Cuentas (vos)** | Meta Business verificada, cuenta de WhatsApp Business, número dedicado, nombre visible aprobado, método de pago, plantillas enviadas a aprobación | Lo hacés vos; puede tardar días |
| **1 · Base** | Migraciones, proveedor (`none`/`fake`/`meta`), contacto + verificación por código, UI de alta y baja, Privacidad | Ninguna |
| **2 · Envío** | Despachador, topes, webhook de estados y bajas, plantillas urgente y dirigida | Fase 0 para probar con Meta real |
| **3 · Medición** | Porcentajes de entrega, lectura y respuesta (`read_at` de la notificación vs `sent_at`, sin rastreo por enlace); reporte por terminal como `funnel:report` | Fase 2 |
| **4 · Ampliar (opcional, con datos)** | Avisos al cliente (presupuesto recibido, con su propio consentimiento), solicitudes no urgentes en resumen | Resultados de la fase 3 |

Las fases 1 a 3 son trabajo de varios PR, cada uno con su validación completa. Estimación gruesa: fase 1 y 2 son lo más pesado (backend + UI); la medición es chica.

## 10. Riesgos

- **Rechazo de plantillas o reclasificación a marketing** → mensajes sobrios, sin emojis ni promoción.
- **Verificación del negocio en Meta**: pide documentación; una persona física con CUIT puede tener más fricción que una empresa. Empezar el trámite cuanto antes.
- **Número argentino con "9"**: el formato `+54 9 …` de móviles tuvo particularidades históricas con WhatsApp. Se normaliza y se prueba con números reales.
- **Hosting que se duerme** (ver 4.3).
- **Costo si el producto crece**: los topes lo contienen; el caso de 2.000 profesionales con 20 avisos al mes ronda US$ 1.040 por mes más recargos del intermediario, si lo hay.
- **Pagos en dólares con tarjeta**: consultar al contador por impuestos y percepciones aplicables.
- **Spam percibido**: solo urgentes y dirigidas, con baja visible. Medir el porcentaje de bajas.

## 11. Lo que necesito de vos para empezar

1. **¿Arrancamos con la fase 1 en cuanto me digas?** Es lo único que no depende de Meta.
2. **¿Con la API de Meta directa o con un intermediario** (Twilio, 360dialog, etc.)? Directa evita la mensualidad pero la integración es más trabajosa; es lo que asume este plan.
3. **¿Cuál es el número de negocio?** Tiene que ser uno que no esté en uso en WhatsApp.
4. **¿El servicio de Render se duerme hoy?** Define cuánto importa el barrido.
5. **Tope inicial de gasto** que querés tolerar al mes.
