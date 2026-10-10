# Resuelve multiciudad

Resuelve deja de depender de Tandil: el catálogo de localidades es nacional (Georef), cada profesional elige
dónde trabaja y cada solicitud llega solo a quien cubre la localidad del trabajo. Tandil sigue igual, con sus
barrios, como una localidad más del modelo. Que una localidad esté en el catálogo **no** significa que haya
profesionales ahí.

## 1. Auditoría (estado anterior)

| Área | Cómo estaba | Acoplamiento a Tandil |
|---|---|---|
| Geografía | `cities` (uuid, `slug` único global, `province` texto) y `zones` (barrios, `city_id`). Solo existía Tandil (`catalog.data.ts`). | `GET /zones` asumía `city = 'tandil'` por defecto. |
| Perfil profesional | `covers_entire_city` ("Todo Tandil") + `professional_service_areas` (barrios). Sin ciudad en el perfil. | "Toda la ciudad" = Tandil implícito. |
| Solicitudes | `service_requests.zone_id` obligatorio; la ciudad se deducía del barrio. | Un pedido no podía ser de una ciudad sin barrios. |
| Matching | No hay difusión: el cliente invita (máx. 5) desde la búsqueda. `requestIneligibility` = activo + servicio + barrio o "Todo Tandil". Búsqueda SQL con el mismo criterio. | `covers_entire_city` matcheaba cualquier barrio de cualquier ciudad (comentado como deuda en el código). |
| Destacados PRO / urgencias / conteos | Mismo SQL de búsqueda, rotación por día + servicio + barrio. | Sin ciudad: un PRO de otra ciudad podía ocupar un destacado. |
| Direcciones | Google sesgado al centro de Tandil (`CITY_BIAS`), `outsideCity` = "no es Tandil". | Hardcodeado. |
| "Tu mes" (benchmark) | `c.slug = 'tandil'`. | Hardcodeado. |
| SEO | `/servicios/:slug` = "Plomeros en Tandil"; sitemap, JSON-LD (`areaServed: Tandil`), pie, `llms.txt`, títulos. | Todo el copy. |
| Frontend | `CITY = 'Tandil'`, `getZones('tandil')`, "Todo Tandil" en onboarding, perfil, tarjetas, home, urgencias. | Hardcodeado. |
| Free/PRO | Cupo Free por oportunidad (`quote_quota_usages`, único por solicitud). Billing por perfil. | Ninguno (no depende de la ciudad). |

## 2. Arquitectura

```
provinces (24, código INDEC/Georef)
  └─ cities  (= localidades; tabla histórica, en la API "locality")
       └─ zones (barrios, opcionales por localidad)

professional_profiles ── primary_city_id ──> cities
professional_localities (professional_id, city_id, covers_entire_city)
professional_service_areas (barrios; cuentan solo dentro de una localidad cubierta)

service_requests.city_id (obligatoria) + zone_id (opcional, FK compuesta (zone_id, city_id))
users.preferred_city_id (preferencia de búsqueda, no domicilio)
```

- **Fuente oficial:** Georef Argentina, recurso **localidades censales** (INDEC). Se eligió frente a
  "localidades" (BAHRA: incluye parajes, decenas de miles de entradas) y "municipios" (unidades de gobierno,
  no lo que la gente busca). Una localidad censal es una ciudad o pueblo reconocible; CABA es una sola.
- **Importación reproducible:** `npm run geo:import` (o `--file`), idempotente por código oficial, nunca borra
  ni cambia un slug publicado, vincula ciudades cargadas a mano (Tandil conserva su id, barrios y datos).
  Nunca se consulta Georef en una búsqueda: todo vive en PostgreSQL.
- **Homónimos:** slug único por provincia; si el nombre se repite en la provincia, todos llevan el
  departamento (`el-rincon-caucete`) y la etiqueta lo muestra ("El Rincón (Caucete), San Juan").
  Búsqueda sin tildes ni mayúsculas (`search_name`, índice por prefijo).
- **Cobertura:** `coverageGap` (única regla, `professional-rules.ts`): primero la localidad, después el barrio.
  Sin barrio (localidad sin barrios) solo alcanza "toda la ciudad". SQL equivalente: `COVERS_LOCALITY_SQL`,
  `HAS_COVERAGE_SQL`.
- **Un solo perfil comercial:** reputación, historial, plan y suscripción son del perfil, no de cada ciudad. El
  cupo Free cuenta oportunidades por solicitud: cubrir varias ciudades nunca duplica consumos.

## 3. Migración (`1794300000000-MultiCityLocalities`)

Expand + backfill, sin pasos destructivos:

1. Crea `provinces` (24 jurisdicciones con código oficial e ISO).
2. Amplía `cities`: `province_id` (desde el texto `province`; si alguna ciudad no matchea, la migración falla
   y lo dice), código oficial, departamento, `search_name`, centroide público, `source`. Slug único por
   provincia.
3. `professional_localities` + `primary_city_id`. Backfill: la ciudad de cada barrio guardado; "Todo Tandil"
   sin barrios → Tandil (era la única ciudad operativa). **Un perfil sin cobertura queda sin localidad**: no se
   le asigna Tandil.
4. `service_requests.city_id` desde el barrio (todas tienen barrio) → `NOT NULL`; `zone_id` pasa a opcional con
   FK compuesta (el barrio siempre es de la localidad del pedido).
5. `users.preferred_city_id` desde `default_zone_id`.

`covers_entire_city` se conserva sincronizado con la localidad principal (contrato legacy y rollback del
backend). El `down` restaura el modelo anterior y se niega si hay solicitudes sin barrio (perdería datos).

Verificado: apply → revert → apply sobre datos "estilo producción" (barrios, "Todo Tandil" con y sin barrios,
perfil sin cobertura, solicitud y cliente con barrio).

**Verificaciones previas y posteriores en producción** (solo lectura): `npm run launch:audit` ahora informa
cuántas localidades hay (y cuántas con código oficial) y profesionales activos por localidad. Además:

```sql
-- antes: todo perfil con cobertura y toda solicitud
SELECT count(*) FILTER (WHERE covers_entire_city) AS todo_tandil, count(*) FROM professional_profiles;
SELECT count(*) FROM service_requests;
-- después: mismos totales, ningún perfil con cobertura sin localidad, ninguna solicitud sin ciudad
SELECT count(*) FROM professional_profiles p WHERE (p.covers_entire_city OR EXISTS (
  SELECT 1 FROM professional_service_areas a WHERE a.professional_id = p.id)) AND p.primary_city_id IS NULL; -- 0
SELECT count(*) FROM service_requests WHERE city_id IS NULL; -- 0
```

## 4. API

| Método | Ruta | |
|---|---|---|
| GET | `/provinces` | Las 24 jurisdicciones |
| GET | `/localities?search=&province=&limit=` | Autocompletar (máx. 20, sin tildes). Sin texto: ciudades con profesionales |
| GET | `/localities/:id?service=` | Detalle: `hasNeighborhoods`, `professionalsCount`, `serviceProfessionalsCount` |
| GET | `/provinces/:provincia/localities/:localidad?service=` | Lo mismo por URL semántica |
| GET | `/localities/:id/neighborhoods` | Barrios (vacío = ciudad completa) |
| GET | `/localities/served?service=` | Localidades con oferta real (SEO) |
| GET | `/localities/served-services` | Pares localidad × servicio con oferta (sitemap) |
| PUT | `/auth/me/locality` | Ciudad elegida de la cuenta (`null` la borra) |
| GET | `/professionals?locality=` | Filtro geográfico; destacados, urgencias, conteos y paginación dentro de esa ciudad |
| POST/PATCH | `/requests` | `localityId` y/o `zoneId` (validados: barrio de esa localidad; con barrios, barrio obligatorio; cambiar de ciudad solo en borrador) |
| POST/PATCH | `/pro/profile` | `primaryLocalityId` + `coverage[{ localityId, coversEntireCity, zoneIds }]` |
| POST | `/location/*` | `localityId`: sesgo y barrios de esa localidad; `suggestedLocality` en la respuesta |

Compatibilidad: `GET /zones?city=tandil` sigue (un slug ambiguo → 422 `AMBIGUOUS_LOCALITY`); `coversEntireCity`
y `zoneIds` sueltos siguen aceptándose para clientes viejos (se aplican a una localidad, `LEGACY_LOCALITY`,
default `buenos-aires/tandil`); `/location/*` sin `localityId` también usa `LEGACY_LOCALITY`. Nuevo error de
invitación: `LOCALITY_NOT_COVERED`.

## 5. Frontend

- `LocalityStore` (Signals, única fuente): **URL > elección (localStorage `resuelve-locality`) > preferencia de
  la cuenta > sugerida > ninguna**. Nunca se impone Tandil a un visitante nuevo.
- `LocalityPicker` / `LocalitySearch`: combobox ARIA, debounce 200 ms + `switchMap` (cancela búsquedas viejas),
  teclado, carga/error/vacío, homónimos, carga diferida (`@defer`). En header, inicio, resultados y urgencias.
- `/profesionales?provincia=&ciudad=`: la URL conserva la ciudad al recargar/compartir. Cambiar de ciudad
  reinicia el barrio y nunca muestra los profesionales de la anterior mientras carga. Ciudad sin oferta:
  "Todavía no encontramos profesionales disponibles en Azul…" + cambiar localidad, otro servicio, invitar.
- Pedido: "¿Dónde es el trabajo?" define la localidad del trabajo (puede no ser la de residencia); barrio solo
  si la localidad tiene barrios; "Usar mi ubicación" sugiere la localidad (la persona confirma).
- Onboarding y Mi perfil: `CoverageEditor` (ciudad principal + otras localidades; toda la ciudad o barrios).

## 6. SEO

- `/servicios/:slug` pasa a ser nacional ("Plomeros · Plomería | Resuelve") y enlaza las localidades con oferta.
- `/ciudades/:provincia/:localidad/servicios/:slug` ("Plomero en Tandil · Plomería | Resuelve"): canonical,
  Open Graph, JSON-LD (`areaServed` City + provincia), migas de 4 niveles. **Indexable solo con al menos un
  profesional real del servicio en esa localidad**; si no, `noindex, follow` y sin canonical.
- Sitemap: solo pares localidad × servicio con oferta (`/localities/served-services`). Nunca miles de páginas
  vacías.
- Matrícula: el texto ya no promete verificación oficial en general; solo describe el sello cuando una persona
  lo aprobó contra el registro correspondiente.

## 7. Despliegue (orden compatible)

Frontend y backend están en el mismo repositorio, pero se despliegan por separado. **Primero backend, después
frontend** (el backend nuevo acepta el contrato viejo; el frontend nuevo necesita los endpoints nuevos).

1. Backup de la base en Render.
2. Deploy del backend (el pre-deploy corre `migration:run:prod`).
3. Verificar `GET /api/v1/health`, `npm run launch:audit` y las consultas de la sección 3.
4. En el Shell de Render: `npm run geo:import -- --dry-run` y después `npm run geo:import` (descarga el JSON
   oficial de Georef; si la red no lo permite, subir el archivo y usar `--file`). Tandil se vincula a su código
   oficial (mismo id).
5. Deploy del frontend en Vercel (incluye las reglas nuevas de `vercel.json` para `/ciudades/...`).
6. Verificar en producción: selector de ciudad, `/profesionales?provincia=buenos-aires&ciudad=tandil`,
   una página `/ciudades/...` con y sin oferta, `sitemap.xml`.

Ventana de deploy y rollback: el frontend anterior sigue funcionando contra el backend nuevo (contrato legacy).
Mientras el backend anterior todavía atiende con el esquema nuevo, sus solicitudes (solo `zone_id`) toman la
localidad del barrio por un trigger de la migración (`TRG_service_requests_city_from_zone`), así nunca fallan.
Un perfil profesional creado o editado por el backend anterior en esa ventana no actualiza
`professional_localities`: se reconcilia con este SQL idempotente (mismo criterio que el backfill) o pidiéndole
que guarde la cobertura de nuevo:

```sql
INSERT INTO professional_localities (professional_id, city_id, covers_entire_city)
SELECT DISTINCT a.professional_id, z.city_id, p.covers_entire_city
  FROM professional_service_areas a JOIN zones z ON z.id = a.zone_id
  JOIN professional_profiles p ON p.id = a.professional_id
ON CONFLICT DO NOTHING;
UPDATE professional_profiles p SET primary_city_id = pl.city_id
  FROM professional_localities pl WHERE pl.professional_id = p.id AND p.primary_city_id IS NULL;
```
 `migration:revert` solo si no hay
solicitudes sin barrio (el `down` se niega si las hay).

## 8. Riesgos y pendientes

- El catálogo nacional solo existe después de `geo:import` (en este entorno no hubo acceso de red a
  datos.gob.ar; se probó con una muestra real de San Juan tomada del repositorio oficial `georef-ar-etl`).
- Barrios: solo Tandil tiene barrios cargados. Otras ciudades funcionan por ciudad completa hasta que se carguen
  barrios desde una fuente documentada (nunca inventados).
- Búsqueda sin localidad (`/professionals` sin `locality`) sigue siendo nacional por compatibilidad; el frontend
  siempre manda la localidad. Con miles de profesionales convendría exigirla.
- "Tu mes" por barrio solo cuenta solicitudes con barrio; la referencia anónima usa la ciudad principal.
- Fase "contract" (más adelante): quitar `covers_entire_city`, `LEGACY_LOCALITY`, `coversEntireCity`/`zoneIds`
  sueltos y `GET /cities`.
- Fuera de alcance: distancias, radios, rutas, mapas con pin. Nunca tracking, seguimiento en vivo ni coordenadas
  privadas públicas.
