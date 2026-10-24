import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppException } from '../../../common/exceptions/app.exception';
import { EventAccessService } from '../../event-access/event-access.service';
import type { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard';

/**
 * Verifica asignación EXPLÍCITA a la actividad, no solo el rol (RF-305,
 * Artículo V: "no hay staff con acceso global"). Aplica también a ADMIN,
 * sin excepción -- el contrato de check-in lo dice literal ("rol STAFF o
 * ADMIN, y además estar asignado"). Un admin que quiera validar se
 * auto-asigna primero vía POST /activities/:id/staff.
 */
@Injectable()
export class ActivityStaffGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly eventAccess: EventAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Los guards corren antes que los Pipes en el ciclo de Nest -- todavía
    // no pasó por ParseUUIDPipe, request.params llega sin narrowing de tipo.
    const activityId = request.params.activityId as string;
    const userId = request.user.sub;

    const assignment = await this.prisma.activityStaff.findUnique({
      where: { activityId_userId: { activityId, userId } },
      include: { activity: { select: { eventId: true } } },
    });

    if (!assignment) {
      throw new AppException(403, 'STAFF_NOT_ASSIGNED', 'No estás asignado a esta actividad.');
    }
    await this.eventAccess.assertEventIdAccess(userId, assignment.activity.eventId);
    return true;
  }
}
