import 'dotenv/config';
import Redis from 'ioredis';

const testRedisUrl = process.env.REDIS_URL;
if (!testRedisUrl) {
  throw new Error('REDIS_URL is required for integration tests.');
}

const testRedis = new URL(testRedisUrl);
const testRedisHost = testRedis.hostname.toLowerCase();
if (!['localhost', '127.0.0.1', '::1'].includes(testRedisHost) || testRedis.port !== '56379') {
  throw new Error(`Integration tests require the isolated Redis instance on local port 56379; received "${testRedis.host}".`);
}

export const redisTestClient = new Redis(testRedisUrl);

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
