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
  datasource: {
    url: env('DATABASE_URL'),
  },
});
