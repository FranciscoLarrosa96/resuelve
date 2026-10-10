import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Resuelve multiciudad (expand + backfill). Nada destructivo:
 *
 * - `provinces`: las 24 jurisdicciones con su código oficial (INDEC/Georef, 2 dígitos) e ISO 3166-2.
 * - `cities` pasa a ser el catálogo de LOCALIDADES: se suma `province_id` (FK), código oficial
 *   de Georef (único cuando existe), departamento, nombre normalizado para buscar sin tildes y
 *   centroide público de la localidad (dato del catálogo oficial, nunca de una persona). El slug
 *   deja de ser global: es único dentro de su provincia (hay "San Martín" en varias).
 *   Las localidades se cargan con `npm run geo:import` (catálogo oficial); la migración solo
 *   relaciona las ciudades que ya existían (Tandil) con su provincia.
 * - `professional_localities`: localidades que cubre cada profesional (toda la ciudad o sus
 *   barrios en `professional_service_areas`) y `professional_profiles.primary_city_id`.
 * - `service_requests.city_id` (obligatoria, desde el barrio) y `zone_id` opcional: una ciudad
 *   sin barrios cargados funciona igual. FK compuesta (zone_id, city_id) → el barrio siempre es
 *   de la localidad del pedido.
 * - `users.preferred_city_id`: la ciudad que eligió la persona (preferencia, no su domicilio).
 *
 * Backfill solo con lo que los datos justifican: barrios → su ciudad; "Todo Tandil"
 * (`covers_entire_city`, la única ciudad operativa hasta hoy) → Tandil. Un perfil sin ninguna
 * cobertura queda sin localidad (no se le asigna Tandil). `covers_entire_city` se conserva
 * (legacy, sincronizado con la localidad principal) para un rollback del backend.
 */

/** Minúsculas, sin tildes ni signos (equivale a `normalizePlaceText` del backend). */
const NORMALIZE = (expr: string) =>
  `trim(regexp_replace(translate(lower(${expr}), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', ' ', 'g'))`;

/** Códigos oficiales (INDEC / Georef) e ISO 3166-2:AR. */
const PROVINCES: [code: string, iso: string, name: string, slug: string][] = [
  ['02', 'AR-C', 'Ciudad Autónoma de Buenos Aires', 'caba'],
  ['06', 'AR-B', 'Buenos Aires', 'buenos-aires'],
  ['10', 'AR-K', 'Catamarca', 'catamarca'],
  ['14', 'AR-X', 'Córdoba', 'cordoba'],
  ['18', 'AR-W', 'Corrientes', 'corrientes'],
  ['22', 'AR-H', 'Chaco', 'chaco'],
  ['26', 'AR-U', 'Chubut', 'chubut'],
  ['30', 'AR-E', 'Entre Ríos', 'entre-rios'],
  ['34', 'AR-P', 'Formosa', 'formosa'],
  ['38', 'AR-Y', 'Jujuy', 'jujuy'],
  ['42', 'AR-L', 'La Pampa', 'la-pampa'],
  ['46', 'AR-F', 'La Rioja', 'la-rioja'],
  ['50', 'AR-M', 'Mendoza', 'mendoza'],
  ['54', 'AR-N', 'Misiones', 'misiones'],
  ['58', 'AR-Q', 'Neuquén', 'neuquen'],
  ['62', 'AR-R', 'Río Negro', 'rio-negro'],
  ['66', 'AR-A', 'Salta', 'salta'],
  ['70', 'AR-J', 'San Juan', 'san-juan'],
  ['74', 'AR-D', 'San Luis', 'san-luis'],
  ['78', 'AR-Z', 'Santa Cruz', 'santa-cruz'],
  ['82', 'AR-S', 'Santa Fe', 'santa-fe'],
  ['86', 'AR-G', 'Santiago del Estero', 'santiago-del-estero'],
  ['90', 'AR-T', 'Tucumán', 'tucuman'],
  ['94', 'AR-V', 'Tierra del Fuego', 'tierra-del-fuego'],
];

export class MultiCityLocalities1794300000000 implements MigrationInterface {
  name = 'MultiCityLocalities1794300000000';

  async up(q: QueryRunner): Promise<void> {
    // ---- Provincias -------------------------------------------------------
    await q.query(
      `CREATE TABLE "provinces" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "official_code" character varying(8) NOT NULL,
         "iso_code" character varying(8) NOT NULL,
         "name" character varying(120) NOT NULL,
         "slug" character varying(120) NOT NULL,
         "active" boolean NOT NULL DEFAULT true,
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_provinces" PRIMARY KEY ("id"),
         CONSTRAINT "UQ_provinces_official_code" UNIQUE ("official_code"),
         CONSTRAINT "UQ_provinces_iso_code" UNIQUE ("iso_code"),
         CONSTRAINT "UQ_provinces_slug" UNIQUE ("slug"))`,
    );
    for (const [code, iso, name, slug] of PROVINCES) {
      await q.query(
        `INSERT INTO "provinces" ("official_code", "iso_code", "name", "slug") VALUES ($1, $2, $3, $4)`,
        [code, iso, name, slug],
      );
    }

    // ---- Localidades (tabla cities) ---------------------------------------
    await q.query(
      `ALTER TABLE "cities"
         ADD "province_id" uuid,
         ADD "official_code" character varying(16),
         ADD "department_name" character varying(120),
         ADD "search_name" character varying(160),
         ADD "centroid_lat" numeric(9,6),
         ADD "centroid_lng" numeric(9,6),
         ADD "source" character varying(24) NOT NULL DEFAULT 'MANUAL',
         ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    // Ciudades existentes → su provincia por nombre normalizado ("Provincia de Buenos Aires" también).
    await q.query(
      `UPDATE "cities" c SET "province_id" = p."id"
         FROM "provinces" p
        WHERE ${NORMALIZE('c."province"')} IN (${NORMALIZE('p."name"')}, 'provincia de ' || ${NORMALIZE('p."name"')})`,
    );
    const orphans: { name: string; province: string }[] = await q.query(
      `SELECT "name", "province" FROM "cities" WHERE "province_id" IS NULL`,
    );
    if (orphans.length) {
      throw new Error(
        `Ciudades sin provincia reconocible (corregir "province" a mano y reintentar): ${orphans
          .map((o) => `${o.name} (${o.province})`)
          .join(', ')}`,
      );
    }
    await q.query(`UPDATE "cities" SET "search_name" = ${NORMALIZE('"name"')}`);
    await q.query(`ALTER TABLE "cities" ALTER COLUMN "province_id" SET NOT NULL`);
    await q.query(`ALTER TABLE "cities" ALTER COLUMN "search_name" SET NOT NULL`);
    await q.query(
      `ALTER TABLE "cities" ADD CONSTRAINT "FK_cities_province" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE RESTRICT`,
    );
    await q.query(`DROP INDEX "public"."IDX_8ef722e770798e37b3205370bf"`);
    await q.query(`CREATE UNIQUE INDEX "UQ_cities_province_slug" ON "cities" ("province_id", "slug")`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_cities_official_code" ON "cities" ("official_code") WHERE "official_code" IS NOT NULL`,
    );
    // Autocompletar por prefijo sin tildes (LIKE 'mar del%').
    await q.query(`CREATE INDEX "IDX_cities_search_name" ON "cities" ("search_name" varchar_pattern_ops)`);

    // Permite la FK compuesta (zone_id, city_id) de las solicitudes.
    await q.query(`CREATE UNIQUE INDEX "UQ_zones_id_city" ON "zones" ("id", "city_id")`);

    // ---- Cobertura profesional --------------------------------------------
    await q.query(`ALTER TABLE "professional_profiles" ADD "primary_city_id" uuid`);
    await q.query(
      `ALTER TABLE "professional_profiles" ADD CONSTRAINT "FK_professional_profiles_primary_city" FOREIGN KEY ("primary_city_id") REFERENCES "cities"("id") ON DELETE RESTRICT`,
    );
    await q.query(
      `CREATE INDEX "IDX_professional_profiles_primary_city" ON "professional_profiles" ("primary_city_id")`,
    );
    await q.query(
      `CREATE TABLE "professional_localities" (
         "professional_id" uuid NOT NULL,
         "city_id" uuid NOT NULL,
         "covers_entire_city" boolean NOT NULL DEFAULT false,
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_professional_localities" PRIMARY KEY ("professional_id", "city_id"),
         CONSTRAINT "FK_professional_localities_professional" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE,
         CONSTRAINT "FK_professional_localities_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT)`,
    );
    await q.query(`CREATE INDEX "IDX_professional_localities_city" ON "professional_localities" ("city_id")`);

    // Backfill 1: la ciudad de cada barrio guardado.
    await q.query(
      `INSERT INTO "professional_localities" ("professional_id", "city_id", "covers_entire_city")
       SELECT DISTINCT a."professional_id", z."city_id", p."covers_entire_city"
         FROM "professional_service_areas" a
         JOIN "zones" z ON z."id" = a."zone_id"
         JOIN "professional_profiles" p ON p."id" = a."professional_id"
       ON CONFLICT DO NOTHING`,
    );
    // Backfill 2: "Todo Tandil" sin barrios guardados → Tandil (única ciudad operativa hasta hoy).
    await q.query(
      `INSERT INTO "professional_localities" ("professional_id", "city_id", "covers_entire_city")
       SELECT p."id", c."id", true
         FROM "professional_profiles" p
         JOIN "cities" c ON c."slug" = 'tandil'
         JOIN "provinces" pr ON pr."id" = c."province_id" AND pr."official_code" = '06'
        WHERE p."covers_entire_city"
          AND NOT EXISTS (SELECT 1 FROM "professional_localities" pl WHERE pl."professional_id" = p."id")`,
    );
    // Principal: la localidad con más barrios cubiertos (hoy, la única).
    await q.query(
      `UPDATE "professional_profiles" p SET "primary_city_id" = (
         SELECT pl."city_id" FROM "professional_localities" pl
          WHERE pl."professional_id" = p."id"
          ORDER BY pl."covers_entire_city" DESC,
                   (SELECT count(*) FROM "professional_service_areas" a JOIN "zones" z ON z."id" = a."zone_id"
                     WHERE a."professional_id" = p."id" AND z."city_id" = pl."city_id") DESC,
                   pl."city_id"
          LIMIT 1)`,
    );

    // ---- Solicitudes ------------------------------------------------------
    await q.query(`ALTER TABLE "service_requests" ADD "city_id" uuid`);
    await q.query(
      `UPDATE "service_requests" r SET "city_id" = z."city_id" FROM "zones" z WHERE z."id" = r."zone_id"`,
    );
    await q.query(`ALTER TABLE "service_requests" ALTER COLUMN "city_id" SET NOT NULL`);
    await q.query(
      `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT`,
    );
    await q.query(`ALTER TABLE "service_requests" ALTER COLUMN "zone_id" DROP NOT NULL`);
    await q.query(
      `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_zone_city" FOREIGN KEY ("zone_id", "city_id") REFERENCES "zones"("id", "city_id") ON DELETE RESTRICT`,
    );
    await q.query(`CREATE INDEX "IDX_service_requests_city" ON "service_requests" ("city_id", "service_id")`);
    // Compatibilidad durante el deploy (y en un rollback del backend): un backend anterior inserta solo
    // `zone_id`; la localidad se deriva del barrio. El backend nuevo siempre manda `city_id`.
    await q.query(
      `CREATE FUNCTION "service_requests_city_from_zone"() RETURNS trigger AS $$
       BEGIN
         IF NEW."city_id" IS NULL AND NEW."zone_id" IS NOT NULL THEN
           SELECT "city_id" INTO NEW."city_id" FROM "zones" WHERE "id" = NEW."zone_id";
         END IF;
         RETURN NEW;
       END $$ LANGUAGE plpgsql`,
    );
    await q.query(
      `CREATE TRIGGER "TRG_service_requests_city_from_zone" BEFORE INSERT ON "service_requests"
       FOR EACH ROW EXECUTE FUNCTION "service_requests_city_from_zone"()`,
    );

    // ---- Preferencia de la persona ------------------------------------------
    await q.query(`ALTER TABLE "users" ADD "preferred_city_id" uuid`);
    await q.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_preferred_city" FOREIGN KEY ("preferred_city_id") REFERENCES "cities"("id") ON DELETE SET NULL`,
    );
    await q.query(
      `UPDATE "users" u SET "preferred_city_id" = z."city_id" FROM "zones" z WHERE z."id" = u."default_zone_id"`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const [{ count }]: { count: number }[] = await q.query(
      `SELECT count(*)::int AS count FROM "service_requests" WHERE "zone_id" IS NULL`,
    );
    if (count > 0) {
      throw new Error(
        `${count} solicitud(es) sin barrio (localidades sin barrios): revertir las dejaría sin ubicación. No se revierte.`,
      );
    }
    await q.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_preferred_city"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "preferred_city_id"`);

    await q.query(`DROP TRIGGER "TRG_service_requests_city_from_zone" ON "service_requests"`);
    await q.query(`DROP FUNCTION "service_requests_city_from_zone"()`);
    await q.query(`DROP INDEX "public"."IDX_service_requests_city"`);
    await q.query(`ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_zone_city"`);
    await q.query(`ALTER TABLE "service_requests" ALTER COLUMN "zone_id" SET NOT NULL`);
    await q.query(`ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_city"`);
    await q.query(`ALTER TABLE "service_requests" DROP COLUMN "city_id"`);

    // Vuelve al modelo de una ciudad: "Todo <ciudad>" = cubre toda su localidad principal.
    await q.query(
      `UPDATE "professional_profiles" p SET "covers_entire_city" = COALESCE((
         SELECT pl."covers_entire_city" FROM "professional_localities" pl
          WHERE pl."professional_id" = p."id" AND pl."city_id" = p."primary_city_id"), false)`,
    );
    await q.query(`DROP TABLE "professional_localities"`);
    await q.query(`DROP INDEX "public"."IDX_professional_profiles_primary_city"`);
    await q.query(
      `ALTER TABLE "professional_profiles" DROP CONSTRAINT "FK_professional_profiles_primary_city"`,
    );
    await q.query(`ALTER TABLE "professional_profiles" DROP COLUMN "primary_city_id"`);

    await q.query(`DROP INDEX "public"."UQ_zones_id_city"`);

    // Las localidades importadas sin barrios se pueden volver a importar: se quitan para
    // recuperar el slug global único. Las que tienen barrios (o se cargaron a mano) quedan.
    await q.query(
      `DELETE FROM "cities" c WHERE c."source" <> 'MANUAL'
          AND NOT EXISTS (SELECT 1 FROM "zones" z WHERE z."city_id" = c."id")`,
    );
    const duplicated: { slug: string }[] = await q.query(
      `SELECT "slug" FROM "cities" GROUP BY "slug" HAVING count(*) > 1`,
    );
    if (duplicated.length) {
      throw new Error(
        `Slugs de ciudad repetidos entre provincias: ${duplicated.map((d) => d.slug).join(', ')}`,
      );
    }
    await q.query(`DROP INDEX "public"."IDX_cities_search_name"`);
    await q.query(`DROP INDEX "public"."UQ_cities_official_code"`);
    await q.query(`DROP INDEX "public"."UQ_cities_province_slug"`);
    await q.query(`CREATE UNIQUE INDEX "IDX_8ef722e770798e37b3205370bf" ON "cities" ("slug")`);
    await q.query(`ALTER TABLE "cities" DROP CONSTRAINT "FK_cities_province"`);
    await q.query(
      `ALTER TABLE "cities" DROP COLUMN "updated_at", DROP COLUMN "created_at", DROP COLUMN "source",
         DROP COLUMN "centroid_lng", DROP COLUMN "centroid_lat", DROP COLUMN "search_name",
         DROP COLUMN "department_name", DROP COLUMN "official_code", DROP COLUMN "province_id"`,
    );
    await q.query(`DROP TABLE "provinces"`);
  }
}
