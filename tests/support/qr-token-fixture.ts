import { createHmac } from 'node:crypto';

/**
 * Replica QrTokenService.sign() para fabricar un token QR vencido en
 * pruebas, sin mockear el reloj del sistema -- QrTokenService.issue() es
 * puro, así que basta con construir el payload a mano con exp en el pasado
 * y firmarlo con el mismo QR_TOKEN_SECRET del entorno de prueba.
 */
export function expiredQrToken(studentId: string): string {
  const secret = process.env.QR_TOKEN_SECRET as string;
  const now = Math.floor(Date.now() / 1000);
  const payload = { sid: studentId, iat: now - 120, exp: now - 60 };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function tamperedQrToken(studentId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sid: studentId, iat: now, exp: now + 60 };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.firma-invalida`;
}
