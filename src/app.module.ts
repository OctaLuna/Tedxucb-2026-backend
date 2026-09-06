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
import { ActivitiesModule } from './modules/activities/activities.module';
import { PointsModule } from './modules/points/points.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { SelectionModule } from './modules/selection/selection.module';
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
    // MailModule al árbol de módulos.
    SpeakersModule,
    // ActivitiesModule: rutas nuevas ('activities', 'activity-categories'),
    // más 'me/qr' (MeQrController) -- sin colisión con 'me/profile'/'me/avatar'
    // de ProfilesModule, son segmentos literales distintos.
    ActivitiesModule,
    // PointsModule: rutas nuevas ('points'), más 'me/points' -- sin colisión
    // con 'me/profile'/'me/avatar'/'me/qr', mismo patrón de segmentos
    // literales distintos bajo 'me'.
    PointsModule,
    // LeaderboardModule: ruta nueva ('leaderboard'), más 'me/progress' --
    // sin colisión con 'me/profile'/'me/avatar'/'me/qr'/'me/points', mismo
    // patrón de segmentos literales distintos bajo 'me'.
    LeaderboardModule,
    // SelectionModule: rutas nuevas ('selection', 'entries'), más
    // 'me/entry' -- sin colisión con 'me/profile'/'me/avatar'/'me/qr'/
    // 'me/points'/'me/progress', mismo patrón de segmentos literales
    // distintos bajo 'me'.
    SelectionModule,
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
