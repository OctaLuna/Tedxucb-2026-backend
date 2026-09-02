import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { ContentModule } from './modules/content/content.module';
import { SpeakersModule } from './modules/speakers/speakers.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    // ProfilesModule DESPUÉS de UsersModule: ambos declaran @Controller('students')
    // en rutas distintas ('pending'/':id'/'approve' vs ''/'export'/':id'), y
    // Nest/Express matchean por orden de registro. Ver la nota en
    // students.controller.ts (profiles) y students-review.controller.ts (users).
    ProfilesModule,
    // ContentModule: rutas nuevas ('public/event', 'events', 'content-blocks'),
    // sin colisión con nada existente -- el orden no importa acá.
    ContentModule,
    // SpeakersModule: rutas nuevas ('public/speakers', 'public/applications',
    // 'speakers', 'applications'), sin colisión con nada existente. Arrastra
    // MailModule (BullMQ) al árbol de módulos, así que createTestApp()
    // también levanta su Worker de verdad en las pruebas.
    SpeakersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true }),
    },
  ],
})
export class AppModule {}
