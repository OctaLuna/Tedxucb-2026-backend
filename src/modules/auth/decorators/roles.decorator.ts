import { SetMetadata } from '@nestjs/common';
import type { Role } from '../auth.constants';

export const ROLES_KEY = 'roles';

/**
 * Solo declara la CATEGORÍA de rol requerida. Donde el permiso real depende
 * de una relación concreta (p. ej. staff asignado a una actividad), el
 * guard de ese módulo se combina con este, nunca lo reemplaza (skill
 * seguridad-y-roles: un rol es una categoría, un permiso es una relación).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
