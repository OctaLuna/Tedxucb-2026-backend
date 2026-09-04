import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Montado ANTES de setGlobalPrefix -- /api/docs queda fuera de
  // /api/v1, mismo criterio que /uploads/* (rutas no versionadas). Los
  // esquemas de los DTO de petición los infiere el plugin de CLI
  // (nest-cli.json) desde sus decoradores de class-validator ya
  // existentes -- no se anotó @ApiProperty() campo por campo (sería la
  // sobre-ingeniería que 003-d ya descartó para un proyecto de este
  // tamaño). Las respuestas compuestas ad-hoc (p. ej. el check-in, que
  // junta tres tablas) no tienen clase de respuesta declarada: quedan
  // como objeto genérico en Swagger. contracts/*.md sigue siendo la
  // fuente exacta de cada forma de respuesta.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TEDxUCB API')
    .setDescription(
      'Backend del TEDxUCB: identidad y perfiles, sitio público, motor de puntos y ' +
        'selección de asistentes. Los modos de fallo exactos de cada endpoint y la forma ' +
        'precisa de cada respuesta viven en specs/*/contracts/*.md del repositorio backend.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });

  // Avatares: servidos como estático, sin pasar por setGlobalPrefix (ver
  // enmienda 2026-09-01 en contracts/perfil-y-catalogo.md — avatarUrl no
  // lleva /api/v1). El directorio no existe en un checkout fresco.
  const uploadDir = path.resolve(process.env.AVATAR_UPLOAD_DIR ?? './uploads/avatars');
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: '/uploads/avatars' });

  // Imágenes de evento: mismo patrón que avatares, directorio y prefijo
  // propios (RF-218, contracts/evento-y-cuenta-regresiva.md).
  const eventImageUploadDir = path.resolve(process.env.EVENT_IMAGE_UPLOAD_DIR ?? './uploads/events');
  mkdirSync(eventImageUploadDir, { recursive: true });
  app.useStaticAssets(eventImageUploadDir, { prefix: '/uploads/events' });

  // Fotos de speaker: mismo patrón, directorio y prefijo propios.
  const speakerPhotoUploadDir = path.resolve(process.env.SPEAKER_PHOTO_UPLOAD_DIR ?? './uploads/speakers');
  mkdirSync(speakerPhotoUploadDir, { recursive: true });
  app.useStaticAssets(speakerPhotoUploadDir, { prefix: '/uploads/speakers' });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap().catch((error) => {
  console.error('\nLa aplicación no pudo arrancar:\n');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
