# 00 — Bootstrap de infraestructura

## Contexto

Este repositorio (`Ted_backend`) es solo el backend/API de TEDxUCB
(`docs/decisiones/ADR-006-repositorio-solo-backend.md`). Hoy no existe
todavía ningún proyecto NestJS: solo hay `package.json` con
`@playwright/test` como devDependency y `playwright.config.ts` (instalados
para las pruebas E2E de los prompts siguientes). Este prompt es el único que
no implementa un módulo de negocio — deja el terreno listo para que todos los
demás prompts (`001-b` en adelante) puedan escribir migraciones, módulos y
pruebas contra un proyecto real.

Antes de tocar nada: lee `memory/constitution.md` completo, en particular el
Artículo I (library-first), el Artículo V (secretos solo por variable de
entorno) y el Artículo VII (máximo 3 módulos por feature — no crear
estructura de más "por si acaso").

## Skill a cargar

`.claude/skills/modulo-backend/SKILL.md`.

## Qué construir

1. **Proyecto NestJS** en la raíz del repo (no anidado — ver ADR-006):
   `src/main.ts`, `src/app.module.ts`, `src/common/` (guards, decorators,
   filters, interceptors compartidos — vacío por ahora), `src/config/`
   (validación de variables de entorno al arrancar, con `zod` o
   `@nestjs/config` + esquema; la app debe **negarse a arrancar** si falta
   una variable, es una decisión ya tomada, no una sugerencia), `src/jobs/`
   (vacío, lo llenan los módulos que lo necesiten).
2. **Prisma**: `prisma/schema.prisma` con el datasource PostgreSQL y el
   generator de cliente; `prisma/migrations/` vacío (las migraciones las crea
   cada módulo); `prisma/seed.ts` vacío por ahora.
3. **Docker Compose** (`docker-compose.yml` en la raíz) con dos servicios:
   `postgres` (imagen oficial, puerto expuesto, volumen nombrado) y `redis`
   (para BullMQ, que usarán los módulos de `003` en adelante). Esto es lo que
   satisface T019 de `specs/003-motor-de-puntos/tasks.md` ("Levantar
   PostgreSQL real en contenedor para las pruebas — Artículo IX, sin mocks"):
   sin este compose ningún prompt posterior puede escribir una sola prueba de
   integración.
4. **Variables de entorno**: `.env.example` con placeholders de
   `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT`, etc. (ya está
   gitignored `.env*` salvo `.env.example`, no hace falta tocar eso).
5. **Endpoint de salud**: `GET /api/v1/health` devolviendo `{ status: "ok" }`
   — sirve de smoke test y de sonda para levantar el servidor en CI/local.
6. **`package.json`**: añade las dependencias reales de NestJS/Prisma/BullMQ
   y los scripts `start`, `start:dev`, `build`, `test` (Jest), `test:e2e`
   (ya existe, Playwright). Configura `tsconfig.json` y `nest-cli.json`.
7. **`tests/{contract,integration,unit}/`**: crea las tres carpetas vacías
   (con un `.gitkeep` o un README breve) — es la estructura que
   `docs/onboarding.md` y `specs/003-motor-de-puntos/plan.md` ya dan por
   existente.
8. **`playwright.config.ts`**: añade la opción `webServer` (comando
   `npm run start`, `url: 'http://localhost:3000/api/v1/health'`,
   `reuseExistingServer: true` en local) para que `npm run test:e2e` levante
   el servidor solo si hace falta.

## Pruebas

No hay módulo de negocio que probar todavía — el "módulo" de este prompt es
la infraestructura misma. Cierre estándar adaptado:

1. **Jest**: una prueba unitaria mínima que confirme que la validación de
   config falla si falta una variable obligatoria (Artículo V).
2. **Playwright**: `tests/e2e/health.e2e.spec.ts` — levanta el servidor
   (`webServer` de `playwright.config.ts`), hace `GET /api/v1/health` y
   verifica `200` y `{ status: "ok" }`. Corrige cualquier fallo antes de
   continuar.
3. Actualiza `docs/progress.md`: fila `00` en la tabla de Módulos → ✅ hecho,
   entrada en la Bitácora.
4. Commit(s), por ejemplo:
   ```
   chore(repo): T019 bootstrap NestJS + Prisma + Docker Compose (Postgres/Redis)
   test(repo): smoke test de /api/v1/health con Playwright
   ```

Ver `prompts/README.md` para el detalle completo del cierre estándar y la
convención de commits.
