import { ProgramEnrollmentService } from './program-enrollment.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

describe('ProgramEnrollmentService', () => {
  const upsert = jest.fn();
  const query = jest.fn();
  const findMany = jest.fn();
  const deleteMany = jest.fn();
  const prisma = {
    event: { findUnique: jest.fn().mockResolvedValue({ id: 'event-1', status: 'PUBLISHED' }) },
    programEnrollment: { findMany, deleteMany },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback({ $queryRaw: query, programEnrollment: { upsert } })),
  };
  const service = new ProgramEnrollmentService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValue([{ status: 'PUBLISHED', type: 'TALK' }]);
    upsert.mockResolvedValue({ programItemId: 'item-1', createdAt: new Date('2026-11-08') });
  });

  it('scopes reads to the authenticated user and event', async () => {
    findMany.mockResolvedValue([]);
    await service.list('user-1', 'innovation-week');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', programItem: { eventId: 'event-1' } } }));
  });

  it('uses the user and item unique key for idempotent enrollment', async () => {
    await service.enroll('user-1', 'item-1', 'innovation-week');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_programItemId: { userId: 'user-1', programItemId: 'item-1' } },
      create: { userId: 'user-1', programItemId: 'item-1' },
    }));
  });

  it.each([[[]], [[{ status: 'DRAFT', type: 'TALK' }]], [[{ status: 'PUBLISHED', type: 'BREAK' }]]])('rejects unavailable or non-enrollable entries', async (rows) => {
    query.mockResolvedValue(rows);
    await expect(service.enroll('user-1', 'item-1', 'innovation-week')).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('limits cancellation to the current user and requested event', async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    await service.cancel('user-1', 'item-1', 'innovation-week');
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', programItemId: 'item-1', programItem: { eventId: 'event-1' } } });
  });
});
