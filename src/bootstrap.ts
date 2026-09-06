import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Configuración compartida entre src/main.ts (`npm run start`/`start:dev`,
 * servidor tradicional con app.listen()) y api/index.ts (entrypoint
 * serverless de Vercel, sin app.listen()) -- todo lo que no depende de
 * cómo termina escuchando la app vive acá, una sola vez.
 */
export async function configureApp(app: NestExpressApplication): Promise<void> {
  // Montado ANTES de setGlobalPrefix -- /api/docs queda fuera de /api/v1
  // (rutas no versionadas). Los esquemas de los DTO de petición los
  // infiere el plugin de CLI (nest-cli.json) desde sus decoradores de
  // class-validator ya existentes -- no se anotó @ApiProperty() campo por
  // campo (sería la sobre-ingeniería que 003-d ya descartó para un
  // proyecto de este tamaño). Las respuestas compuestas ad-hoc (p. ej. el
  // check-in, que junta tres tablas) no tienen clase de respuesta
  // declarada: quedan como objeto genérico en Swagger. contracts/*.md
  // sigue siendo la fuente exacta de cada forma de respuesta.
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

  // Fallback de disco local para subidas (ver UploadService) -- solo
  // cuando no hay Vercel Blob configurado (desarrollo/pruebas). El
  // filesystem de Vercel es efímero fuera de /tmp: en producción SIEMPRE
  // debe estar BLOB_READ_WRITE_TOKEN configurado, y este bloque nunca se
  // activa ahí.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const uploadDir = path.resolve('./uploads');
    mkdirSync(uploadDir, { recursive: true });
    app.useStaticAssets(uploadDir, { prefix: '/uploads' });
  }
}
