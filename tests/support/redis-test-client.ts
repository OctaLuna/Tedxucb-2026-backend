import 'dotenv/config';
import Redis from 'ioredis';

export const redisTestClient = new Redis(process.env.REDIS_URL as string);

/**
 * A diferencia de Postgres (truncada entre pruebas), Redis es un recurso
 * real compartido entre TODOS los archivos de prueba — sin esto, el
 * contador de rate limiting de un archivo contamina al siguiente (skill
 * pruebas: "base limpia entre pruebas").
 */
export async function cleanRateLimits(): Promise<void> {
  const keys = await redisTestClient.keys('rate-limit:*');
  if (keys.length > 0) {
    await redisTestClient.del(...keys);
  }
}

export async function closeRedisTestClient(): Promise<void> {
  await redisTestClient.quit();
}
