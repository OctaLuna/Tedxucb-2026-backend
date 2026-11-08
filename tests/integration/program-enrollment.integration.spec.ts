import { randomUUID } from 'node:crypto';
import { prismaTestClient, closeTestDb } from '../support/prisma-test-client';
import { ProgramEnrollmentService } from '../../src/modules/content/program-enrollment.service';
import type { PrismaService } from '../../src/common/prisma/prisma.service';
import { PrismaService as PrismaToken } from '../../src/common/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { EventAccessGuard } from '../../src/modules/event-access/event-access.guard';
import { EventAccessService } from '../../src/modules/event-access/event-access.service';
import { ProgramEnrollmentController } from '../../src/modules/content/program-enrollment.controller';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

describe('program enrollment persistence', () => {
  const service = new ProgramEnrollmentService(prismaTestClient as unknown as PrismaService);
  const suffix = randomUUID();
  const slug = `enrollment-${suffix}`;
  let userId: string;
  let otherUserId: string;
  let eventId: string;
  let itemId: string;
  let draftId: string;
  let breakId: string;
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const user = await prismaTestClient.user.create({ data: { email: `a-${suffix}@example.com`, fullName: 'Test', nickname: `A${suffix}`, nicknameKey: `a${suffix}`, status: 'ACTIVE', registrationSource: 'GOOGLE' } });
    const other = await prismaTestClient.user.create({ data: { email: `b-${suffix}@example.com`, fullName: 'Test', nickname: `B${suffix}`, nicknameKey: `b${suffix}`, status: 'ACTIVE', registrationSource: 'GOOGLE' } });
    userId = user.id;
    otherUserId = other.id;
    const event = await prismaTestClient.event.create({ data: { slug, name: 'Test', startsAt: new Date(), status: 'PUBLISHED' } });
    eventId = event.id;
    await prismaTestClient.eventEmailAccess.create({ data: { emailNormalized: user.email, eventId } });
    const base = { eventId, title: 'Test', startsAt: new Date('2030-01-01'), endsAt: new Date('2030-01-02') };
    itemId = (await prismaTestClient.eventProgramItem.create({ data: { ...base, type: 'TALK', status: 'PUBLISHED' } })).id;
    draftId = (await prismaTestClient.eventProgramItem.create({ data: { ...base, type: 'TALK', status: 'DRAFT' } })).id;
    breakId = (await prismaTestClient.eventProgramItem.create({ data: { ...base, type: 'BREAK', status: 'PUBLISHED' } })).id;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'local-integration-test-secret-only' })],
      controllers: [ProgramEnrollmentController],
      providers: [ProgramEnrollmentService, JwtAuthGuard, EventAccessGuard, EventAccessService, { provide: PrismaToken, useValue: prismaTestClient }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    await prismaTestClient.programEnrollment.deleteMany({ where: { programItem: { eventId } } });
    await prismaTestClient.eventProgramItem.deleteMany({ where: { eventId } });
    await prismaTestClient.eventEmailAccess.deleteMany({ where: { eventId } });
    await prismaTestClient.event.deleteMany({ where: { id: eventId } });
    await prismaTestClient.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await closeTestDb();
  });

  it('persists concurrent retries once, isolates users, and cancels idempotently', async () => {
    await Promise.all(Array.from({ length: 4 }, () => service.enroll(userId, itemId, slug)));
    expect(await prismaTestClient.programEnrollment.count({ where: { userId, programItemId: itemId } })).toBe(1);
    expect((await service.list(userId, slug)).data.map(item => item.programItemId)).toEqual([itemId]);
    expect((await service.list(otherUserId, slug)).data).toEqual([]);
    await service.cancel(otherUserId, itemId, slug);
    expect(await prismaTestClient.programEnrollment.count({ where: { userId, programItemId: itemId } })).toBe(1);
    await service.cancel(userId, itemId, slug);
    await service.cancel(userId, itemId, slug);
    expect((await service.list(userId, slug)).data).toEqual([]);
    await service.enroll(userId, itemId, slug);
    expect((await service.list(userId, slug)).data).toHaveLength(1);
  });

  it('rejects draft entries, breaks, and IDs from another event', async () => {
    await expect(service.enroll(userId, draftId, slug)).rejects.toThrow();
    await expect(service.enroll(userId, breakId, slug)).rejects.toThrow();
    await expect(service.enroll(userId, itemId, 'innovation-week')).rejects.toThrow();
  });

  it('enforces bearer authentication and event access over HTTP', async () => {
    const endpoint = `/me/program-enrollments/${itemId}?eventSlug=${slug}`;
    const token = jwt.sign({ sub: userId, roles: [], status: 'ACTIVE' });
    const deniedToken = jwt.sign({ sub: otherUserId, roles: [], status: 'ACTIVE' });
    expect((await request(app.getHttpServer()).put(endpoint)).status).toBe(401);
    expect((await request(app.getHttpServer()).put(endpoint).set('Authorization', `Bearer ${deniedToken}`)).status).toBe(403);
    expect((await request(app.getHttpServer()).put(endpoint).set('Authorization', `Bearer ${token}`)).status).toBe(200);
    const list = await request(app.getHttpServer()).get(`/me/program-enrollments?eventSlug=${slug}`).set('Authorization', `Bearer ${token}`);
    expect(list.body.data.map((item: { programItemId: string }) => item.programItemId)).toEqual([itemId]);
    expect((await request(app.getHttpServer()).delete(endpoint).set('Authorization', `Bearer ${token}`)).status).toBe(204);
    expect(await prismaTestClient.programEnrollment.count({ where: { userId, programItemId: itemId } })).toBe(0);
  });
});
