import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });

  // Avatares: servidos como estático, sin pasar por setGlobalPrefix (ver
  // enmienda 2026-09-01 en contracts/perfil-y-catalogo.md — avatarUrl no
  // lleva /api/v1). El directorio no existe en un checkout fresco.
  const uploadDir = path.resolve(process.env.AVATAR_UPLOAD_DIR ?? './uploads/avatars');
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: '/uploads/avatars' });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap().catch((error) => {
  console.error('\nLa aplicación no pudo arrancar:\n');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
