import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';

/**
 * El pipe de validación global y el filtro de excepciones se registran
 * dentro de AppModule (APP_PIPE / APP_FILTER) para que main.ts y las
 * pruebas obtengan exactamente el mismo comportamiento sin duplicarlo aquí.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();

  return app;
}
