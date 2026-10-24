import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url({ message: 'debe ser una URL de PostgreSQL válida' }),
  REDIS_URL: z.string().url({ message: 'debe ser una URL de Redis válida' }),
  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Local env files commonly keep this key empty until Google OAuth is set up.
  GOOGLE_CLIENT_ID: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional()),
  // Server-only allowlist. These accounts receive ADMIN plus access to both
  // supported events when they authenticate with Google.
  ADMIN_EMAILS: z.string().default('').transform((value, context) => {
    const emails = [...new Set(value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))];
    const invalid = emails.filter((email) => !z.string().email().safeParse(email).success);
    if (invalid.length) context.addIssue({ code: 'custom', message: 'debe contener solo correos válidos separados por coma' });
    return emails;
  }),
  PUBLIC_FRONTEND_URL_TEDX: z.string().url().optional(),
  PUBLIC_FRONTEND_URL_INNOVATION_WEEK: z.string().url().optional(),
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
  AVATAR_BRIDGE_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres').optional(),
  // QStash (Upstash) reemplaza al worker persistente de BullMQ para correos
  // y la reconciliación diaria -- no existe en un entorno serverless
  // (Vercel). Sin estas tres, MailService envía directo (dev/pruebas,
  // contra Mailpit) en vez de publicar a QStash. PUBLIC_URL es la URL
  // pública del propio backend desplegado, a la que QStash llama de vuelta.
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
  // Opcional: solo hace falta cuando la cuenta de Upstash QStash tiene su
  // endpoint fijado a una región específica (p. ej.
  // https://qstash-eu-central-1.upstash.io) en vez del enrutamiento
  // global por defecto del SDK (https://qstash.upstash.io).
  QSTASH_URL: z.string().url().optional(),
  PUBLIC_URL: z.string().url().optional(),
}).superRefine((env, context) => {
  if (env.NODE_ENV === 'production' && !env.GOOGLE_CLIENT_ID) {
    context.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: 'es requerido en producción para habilitar el inicio de sesión Google' });
  }
  if (env.NODE_ENV === 'production' && !env.AVATAR_BRIDGE_SECRET) {
    context.addIssue({ code: 'custom', path: ['AVATAR_BRIDGE_SECRET'], message: 'es requerido en producción para vincular y revocar avatares' });
  }
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
