import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Sin esto, `prisma migrate dev`/`prisma db seed` no ejecutan
    // prisma/seed.ts -- Prisma 7 movió esta config fuera de
    // package.json#prisma.seed (que queda ignorado). Sin este cambio, el
    // seed de 001 (seedTestCatalog, seedPlaceholderConsentVersion) tampoco
    // corría automáticamente.
    seed: 'ts-node prisma/seed.ts',
  },
  // @prisma/config (7.10) no tiene un campo `directUrl` -- a diferencia del
  // datasource de schema.prisma. Las migraciones/CLI leen DIRECT_URL acá;
  // la app en runtime (src/common/prisma/prisma.service.ts) lee
  // DATABASE_URL por su cuenta, vía @prisma/adapter-pg, sin pasar por este
  // archivo. En Supabase, DATABASE_URL apunta al *connection pooler*
  // (puerto 6543, para las funciones serverless) y DIRECT_URL a la
  // conexión directa (puerto 5432, la única que soporta los *prepared
  // statements* que usan las migraciones). En local (Docker Compose, sin
  // pooler) ambas pueden ser la misma URL.
  datasource: {
    url: env('DIRECT_URL'),
  },
});
