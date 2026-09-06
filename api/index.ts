import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import type { Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

/**
 * Entrypoint serverless de Vercel: envuelve el mismo AppModule/bootstrap
 * que src/main.ts, pero sin app.listen() -- Vercel invoca esta función
 * directamente en vez de mantener un servidor escuchando. Vercel soporta
 * exportar una instancia de Express como handler tal cual (el `Node.js
 * runtime` la detecta y la llama con (req, res)), así que no hace falta
 * ningún paquete adaptador extra (serverless-http, etc.).
 *
 * `expressApp` y la promesa de arranque quedan a nivel de módulo: en una
 * invocación "caliente" (misma instancia de función reutilizada por
 * Vercel) el bootstrap no se repite.
 */
const expressApp = express();
let bootstrapped: Promise<void> | undefined;

async function ensureBootstrapped(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      // rawBody: true -- ver QstashSignatureGuard, verifica la firma de
      // QStash contra el cuerpo crudo, no contra el JSON ya parseado.
      const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(expressApp), {
        rawBody: true,
      });
      await configureApp(app);
      await app.init();
    })();
  }
  await bootstrapped;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  await ensureBootstrapped();
  expressApp(req, res);
}
