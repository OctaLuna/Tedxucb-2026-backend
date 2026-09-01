import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegistrationController } from './registration.controller';
import { UsersController } from './users.controller';
import { StudentsReviewController } from './students-review.controller';
import { MeCorrectionRequestsController } from './me-correction-requests.controller';
import { CorrectionRequestsController } from './correction-requests.controller';
import { AuditLogController } from './audit-log.controller';
import { RegistrationService } from './registration.service';
import { UsersService } from './users.service';
import { CorrectionRequestsService } from './correction-requests.service';

@Module({
  imports: [AuthModule],
  controllers: [
    RegistrationController,
    UsersController,
    StudentsReviewController,
    MeCorrectionRequestsController,
    CorrectionRequestsController,
    AuditLogController,
  ],
  providers: [RegistrationService, UsersService, CorrectionRequestsService],
  exports: [UsersService],
})
export class UsersModule {}
