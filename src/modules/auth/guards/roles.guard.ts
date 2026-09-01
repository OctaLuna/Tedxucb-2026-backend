import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/exceptions/app.exception';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { Role } from '../auth.constants';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * Se aplica siempre después de JwtAuthGuard (necesita request.user ya
 * poblado). Verifica solo la categoría de rol — la relación concreta
 * (asignación explícita) la verifica el guard propio de cada módulo.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // @Roles() se aplica a veces sobre el método, a veces sobre toda la
    // clase (p. ej. UsersController). reflector.get() con context.getHandler()
    // SOLO lee metadata de método y devuelve undefined en silencio para un
    // @Roles() de clase, dejando pasar a cualquier autenticado -- bug real
    // encontrado por las pruebas de contrato. getAllAndOverride() revisa
    // método y clase, en ese orden.
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const hasRole = request.user?.roles?.some((role) => requiredRoles.includes(role as Role));

    if (!hasRole) {
      throw new AppException(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
    }

    return true;
  }
}
