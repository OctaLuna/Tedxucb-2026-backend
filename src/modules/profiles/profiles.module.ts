import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../../common/upload/upload.module';
import { MeProfileController } from './me-profile.controller';
import { StudentsController } from './students.controller';
import { FacultiesController } from './faculties.controller';
import { CareersController } from './careers.controller';
import { ConsentVersionsController } from './consent-versions.controller';
import { PublicConsentController } from './public-consent.controller';
import { ProfileService } from './profile.service';
import { StudentsService } from './students.service';
import { CatalogService } from './catalog.service';
import { ConsentVersionsService } from './consent-versions.service';
import { EventAccessModule } from '../event-access/event-access.module';

@Module({
  imports: [AuthModule, UploadModule, EventAccessModule],
  controllers: [
    MeProfileController,
    StudentsController,
    FacultiesController,
    CareersController,
    ConsentVersionsController,
    PublicConsentController,
  ],
  providers: [ProfileService, StudentsService, CatalogService, ConsentVersionsService],
})
export class ProfilesModule {}
