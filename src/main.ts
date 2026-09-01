import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap().catch((error) => {
  console.error('\nLa aplicación no pudo arrancar:\n');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
