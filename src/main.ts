import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap().catch((error) => {
  console.error('\nLa aplicación no pudo arrancar:\n');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
