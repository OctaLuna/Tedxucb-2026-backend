import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReconciliationService, ReconciliationReport } from '../modules/points/reconciliation.service';

interface ReconcileArgs {
  student?: string;
  all: boolean;
  fix: boolean;
  operator?: string;
  json: boolean;
}

/**
 * Sin librería de parseo: son 4 flags (Artículo VII, no agregar una
 * dependencia para esto). Función pura, exportada para probarla sin
 * levantar el proceso completo (Artículo I).
 */
export function parseReconcileArgs(argv: string[]): ReconcileArgs {
  const args: ReconcileArgs = { all: false, fix: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--student') {
      args.student = argv[++i];
    } else if (flag === '--all') {
      args.all = true;
    } else if (flag === '--fix') {
      args.fix = true;
    } else if (flag === '--operator') {
      args.operator = argv[++i];
    } else if (flag === '--json') {
      args.json = true;
    } else {
      throw new Error(`Flag desconocida: ${flag}`);
    }
  }

  if (!args.student && !args.all) {
    throw new Error('Debes indicar --student <código> o --all.');
  }
  if (args.student && args.all) {
    throw new Error('--student y --all son mutuamente excluyentes.');
  }
  if (args.fix && !args.operator) {
    throw new Error('--fix exige --operator <email>: la corrección queda auditada a nombre de quien la ejecuta.');
  }

  return args;
}

function printReport(report: unknown): void {
  console.log(JSON.stringify(report, null, 2));
}

async function resolveOperatorId(prisma: PrismaService, email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { roles: true } });
  if (!user || !user.roles.some((role) => role.role === 'ADMIN')) {
    throw new Error(`--operator ${email} no corresponde a un administrador existente.`);
  }
  return user.id;
}

async function runReconcile(args: ReconcileArgs): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const reconciliation = app.get(ReconciliationService);
    const operatorId = args.fix ? await resolveOperatorId(prisma, args.operator as string) : undefined;

    if (args.student) {
      // args.student es el studentCode (el ejemplo del contrato usa el
      // código, no el UUID) -- checkStudent/fixStudent esperan el userId,
      // así que se resuelve primero.
      const student = await prisma.studentProfile.findUnique({ where: { studentCode: args.student } });
      if (!student) {
        throw new Error(`No existe ningún alumno con código ${args.student}.`);
      }
      const profileReport = await reconciliation.checkStudent(student.userId);
      const eventDiscrepancies = await reconciliation.checkEventProjection(student.userId);
      if (args.fix && (!profileReport.consistent || eventDiscrepancies.length > 0)) {
        await reconciliation.fixStudent(student.userId, operatorId as string);
      }
      printReport({
        profile: await reconciliation.checkStudent(student.userId),
        eventPoints: await reconciliation.checkEventProjection(student.userId),
      });
      return;
    }

    const discrepancies = await reconciliation.checkAll();
    const eventDiscrepancies = await reconciliation.checkEventProjection();
    if (args.fix) {
      const affectedStudents = new Set([
        ...discrepancies.map((discrepancy) => discrepancy.studentId),
        ...eventDiscrepancies.map((discrepancy) => discrepancy.studentId),
      ]);
      const fixed: ReconciliationReport[] = [];
      for (const affectedStudent of affectedStudents) {
        fixed.push(await reconciliation.fixStudent(affectedStudent, operatorId as string));
      }
      printReport({
        profiles: fixed,
        eventPoints: await reconciliation.checkEventProjection(),
      });
      return;
    }
    printReport({ profiles: discrepancies, eventPoints: eventDiscrepancies });
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'reconcile') {
    console.error('Uso: points-cli reconcile (--student <código> | --all) [--fix --operator <email>] [--json]');
    process.exit(1);
  }
  const args = parseReconcileArgs(rest);
  await runReconcile(args);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
