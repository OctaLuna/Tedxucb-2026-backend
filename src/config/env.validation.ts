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
