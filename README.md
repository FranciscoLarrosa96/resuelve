# Resuelve

Marketplace local de servicios profesionales (Tandil).

```text
resuelve/
  src/        frontend Angular 22 (Tailwind, signals). Datos mock en src/app/core/data
  backend/    API REST NestJS + PostgreSQL → ver backend/README.md
```

## Frontend

Requiere Node 22.22.3+ o 24.15+ (lo exige Angular CLI 22).

```bash
npm ci
npm start          # http://localhost:4200
npm run build      # build de producción (prerender estático)
npm test           # Vitest
```

- `src/styles.css` define los tokens de la identidad: colores, escala de radios (6/8/10/12/16 px), sombras (solo para elementos flotantes) y motion.
- `src/environments/environment*.ts` define `apiUrl`. En producción está vacía hasta que el backend esté desplegado; la app sigue funcionando con los mocks.
- `src/app/core/api/` tiene un cliente HTTP mínimo para la integración con el backend. Todavía no lo usan los stores.
- Las fotos de profesionales son mocks, centralizadas en `src/app/core/data/mock-media.ts`. Si una foto falla, el avatar muestra las iniciales.

## Backend

Ver [backend/README.md](backend/README.md): instalación, variables de entorno, migraciones, seed, tests, Swagger y los pasos para Render.
