import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '../support/test-app';
import { cleanAllTables, closeTestDb, prismaTestClient } from '../support/prisma-test-client';
import { seedStudent } from '../support/seed-catalog';
import { LeaderboardService } from '../../src/modules/leaderboard/leaderboard.service';
import { seedEvent } from '../support/seed-content';

/**
 * RF-339: con puntajes empatados, precede quien alcanzó ese puntaje
 * primero. Contra Postgres real -- el desempate vive en RANK() OVER, no en
 * código de aplicación que podría reordenar de forma distinta entre
 * ejecuciones.
 */
describe('Desempate determinista del ranking (T018, RF-339)', () => {
  let app: INestApplication;
  let leaderboardService: LeaderboardService;

  beforeAll(async () => {
    app = await createTestApp();
    leaderboardService = app.get(LeaderboardService);
  });

  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanAllTables();
    await seedEvent();
  });

  it('con puntajes empatados, precede quien llegó primero -- y el orden es idéntico en dos ejecuciones seguidas', async () => {
    const { user: first } = await seedStudent({ email: `empate-primero-${Date.now()}@ucb.edu.bo` });
    const { user: second } = await seedStudent({ email: `empate-segundo-${Date.now()}@ucb.edu.bo` });

    const earlier = new Date(Date.now() - 60_000);
    const later = new Date();

    await prismaTestClient.pointTransaction.create({
      data: { studentId: first.id, points: 30, type: 'BONUS', reason: 'seed', createdAt: earlier },
    });
    await prismaTestClient.studentProfile.update({ where: { userId: first.id }, data: { totalPoints: 30 } });
    await prismaTestClient.pointTransaction.create({
      data: { studentId: second.id, points: 30, type: 'BONUS', reason: 'seed', createdAt: later },
    });
    await prismaTestClient.studentProfile.update({ where: { userId: second.id }, data: { totalPoints: 30 } });

    const firstRun = await leaderboardService.getLeaderboard({});
    const secondRun = await leaderboardService.getLeaderboard({});

    expect(firstRun.data.map((row) => row.studentId)).toEqual([first.id, second.id]);
    expect(secondRun.data.map((row) => row.studentId)).toEqual([first.id, second.id]);
    expect(firstRun.data[0].position).toBe(1);
    expect(firstRun.data[1].position).toBe(2);
  });
});
