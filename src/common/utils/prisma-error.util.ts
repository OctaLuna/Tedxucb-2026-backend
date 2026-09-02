/**
 * Detecta la violación de una restricción única de Postgres por su nombre,
 * a partir del mensaje de error de Prisma. Usado como segunda capa (además
 * del pre-check con `findUnique`) contra condiciones de carrera reales —
 * dos escrituras concurrentes pueden pasar ambas el pre-check.
 */
export function isUniqueConstraintViolation(error: unknown, constraintOrIndexName: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(constraintOrIndexName);
}
