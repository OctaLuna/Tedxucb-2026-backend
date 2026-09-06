import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url({ message: 'debe ser una URL de PostgreSQL válida' }),
  REDIS_URL: z.string().url({ message: 'debe ser una URL de Redis válida' }),
  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Defaults apuntan a Mailpit local (docker-compose.yml) -- dev/tests
  // funcionan sin tocar .env. En producción se sobreescriben con
  // credenciales SMTP reales.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('TEDxUCB <no-reply@tedxucb.local>'),
  // Secreto propio del token QR de check-in (RF-311/312), distinto de
  // JWT_SECRET -- defensa en profundidad: si uno se filtra, el otro sigue
  // protegido.
  QR_TOKEN_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  // QStash (Upstash) reemplaza al worker persistente de BullMQ para correos
  // y la reconciliación diaria -- no existe en un entorno serverless
  // (Vercel). Sin estas tres, MailService envía directo (dev/pruebas,
  // contra Mailpit) en vez de publicar a QStash. PUBLIC_URL es la URL
  // pública del propio backend desplegado, a la que QStash llama de vuelta.
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  PUBLIC_URL: z.string().url().optional(),
});

// BLOB_READ_WRITE_TOKEN (Vercel Blob, ver src/common/upload/upload.service.ts)
// no está acá: el SDK de @vercel/blob lo lee directo de process.env, nadie
// en este proyecto lo pide vía ConfigService -- documentado en
// .env.example, no en este esquema (que solo valida lo que el código
// realmente consume por config.get(...)).

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const detalles = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `La aplicación no puede arrancar: variables de entorno inválidas o faltantes.\n${detalles}\n\n` +
        'Copia .env.example a .env y completa los valores antes de continuar.',
    );
  }

  return result.data;
}
