import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url({ message: 'debe ser una URL de PostgreSQL válida' }),
  REDIS_URL: z.string().url({ message: 'debe ser una URL de Redis válida' }),
  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AVATAR_UPLOAD_DIR: z.string().default('./uploads/avatars'),
  EVENT_IMAGE_UPLOAD_DIR: z.string().default('./uploads/events'),
  SPEAKER_PHOTO_UPLOAD_DIR: z.string().default('./uploads/speakers'),
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
});

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
