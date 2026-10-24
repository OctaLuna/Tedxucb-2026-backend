import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventAccessController, MyEventAccessController } from './event-access.controller';
import { EventAccessService } from './event-access.service';
import { EventAccessGuard } from './event-access.guard';
import { EventIdAccessGuard } from './event-id-access.guard';

@Module({ imports: [AuthModule], controllers: [EventAccessController, MyEventAccessController], providers: [EventAccessService, EventAccessGuard, EventIdAccessGuard], exports: [EventAccessService, EventAccessGuard, EventIdAccessGuard] })
export class EventAccessModule {}
