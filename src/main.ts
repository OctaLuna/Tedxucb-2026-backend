import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  // rawBody: true -- necesario para que QstashSignatureGuard verifique la
  // firma de QStash contra el cuerpo crudo de la petición, byte a byte,
  // no contra el JSON ya parseado (ver src/common/qstash/qstash-signature.guard.ts).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.set('query parser', 'extended');
  await configureApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap().catch((error) => {
  console.error('\nLa aplicación no pudo arrancar:\n');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
