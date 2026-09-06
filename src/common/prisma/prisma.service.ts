import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EnvConfig } from '../../config/env.validation';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<EnvConfig, true>) {
    const adapter = new PrismaPg({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      // Sin tope, cada invocación serverless (Vercel) abre su propio pool
      // de conexiones contra el *connection pooler* de Supabase -- bajo
      // carga concurrente eso agota las conexiones. max:1 mantiene una
      // sola conexión por invocación; el pooler de Supabase es quien
      // multiplexa muchas invocaciones sobre pocas conexiones reales a
      // Postgres. En local (Docker Compose, sin límite del proveedor) no
      // hace falta, pero tampoco molesta.
      max: 1,
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
