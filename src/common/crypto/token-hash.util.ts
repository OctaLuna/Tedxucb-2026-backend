import { randomBytes, createHash } from 'node:crypto';

/**
 * Token opaco de alta entropía (32 bytes) para sesiones y tokens de un solo
 * uso. Se guarda su hash, nunca el token (skill seguridad-y-roles).
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * SHA-256 basta aquí: a diferencia de una contraseña, el token ya tiene alta
 * entropía aleatoria, así que no hace falta un hash lento tipo Argon2 para
 * encarecer la fuerza bruta — solo igualdad exacta y rápida.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
