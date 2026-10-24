import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { EventAccessService } from './event-access.service';

@Injectable()
export class EventAccessGuard implements CanActivate {
  constructor(private readonly eventAccess: EventAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const querySlug = request.query.eventSlug;
    const bodySlug = (request.body as { eventSlug?: unknown } | undefined)?.eventSlug;
    const requestedSlug = querySlug ?? bodySlug;
    if (requestedSlug !== undefined && typeof requestedSlug !== 'string') {
      throw new AppException(400, 'INVALID_EVENT', 'El evento indicado no es válido.');
    }
    await this.eventAccess.assertEventAccess(request.user.sub, requestedSlug ?? 'tedxucb');
    return true;
  }
}
