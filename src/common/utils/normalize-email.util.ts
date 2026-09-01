/**
 * `users.email` exige `CHECK (email = lower(email))` a nivel de motor
 * (ver migración de `auth`): toda escritura y toda consulta debe pasar por
 * aquí primero, nunca confiar en que el remitente ya envió minúsculas.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
