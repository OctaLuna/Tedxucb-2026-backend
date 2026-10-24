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
    .addServer('/api/v1', 'API v1')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  // customCssUrl/customJs: swagger-ui-dist normalmente se sirve como
  // estático local (express.static sobre la carpeta del paquete), pero el
  // *file tracer* de Vercel no detecta esa ruta resuelta en tiempo de
  // ejecución y esos archivos nunca llegan al despliegue -- 404 real
  // encontrado probando el link en producción. Se cargan desde jsdelivr
  // en vez de pelear con el tracing; versión fijada a la exacta que trae
  // instalada @nestjs/swagger@11.4.7 (swagger-ui-dist@5.32.13) para que la
  // API que espera el HTML generado coincida con la que carga el CDN.
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui.min.css',
    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui-bundle.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui-standalone-preset.js',
    ],
  });

  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      // script-src por defecto de Helmet es 'self': bloquearía los
      // scripts de Swagger UI cargados desde jsdelivr de arriba, aunque
      // el 404 ya esté resuelto -- el navegador los descartaría igual por
      // CSP (visto en la consola del responsable probando el link real).
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
        },
      },
    }),
  );
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });

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
