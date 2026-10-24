import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { EventAccessService } from './event-access.service';

@Injectable()
export class EventIdAccessGuard implements CanActivate {
  constructor(private readonly eventAccess: EventAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const eventId = request.params.id;
    if (typeof eventId !== 'string') throw new AppException(400, 'INVALID_EVENT', 'El evento indicado no es válido.');
    await this.eventAccess.assertEventIdAccess(request.user.sub, eventId);
    return true;
  }
}
