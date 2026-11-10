import { createHash } from 'node:crypto';
import { ProgramAttendanceService } from './program-attendance.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { EventAccessService } from '../event-access/event-access.service';
import type { LedgerService } from '../../common/ledger/ledger.service';

const token = 'a'.repeat(43);
const tokenHash = createHash('sha256').update(token).digest('hex');
const item = (patch: Record<string, unknown> = {}) => ({
  id: 'item-1', eventId: 'event-1', title: 'Charla', status: 'PUBLISHED', type: 'TALK',
  startsAt: new Date('2026-11-08T09:00:00Z'), endsAt: new Date('2026-11-08T10:00:00Z'),
  event: { slug: 'innovation-week', status: 'PUBLISHED' }, ...patch,
});

describe('ProgramAttendanceService', () => {
  const linkFind = jest.fn();
  const attendanceFind = jest.fn();
  const attendanceCreate = jest.fn();
  const itemsFind = jest.fn();
  const activityFind = jest.fn().mockResolvedValue(null);
  const ledgerRecord = jest.fn().mockImplementation(async (_tx: unknown, input: { points: number }) => ({ points: input.points }));
  const itemFindFirst = jest.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(item({ id: where.id })));
  const transactionTx = {
    $queryRaw: jest.fn(),
    programAttendanceLink: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn().mockResolvedValue({ id: 'link-1', createdAt: new Date() }) },
    auditLog: { create: jest.fn() },
    programAttendance: { findUnique: attendanceFind, create: attendanceCreate },
    activity: { findUnique: activityFind },
    pointTransaction: { findUnique: jest.fn().mockResolvedValue(null) },
    eventStudentPoints: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const service = new ProgramAttendanceService({
    event: { findUnique: jest.fn().mockResolvedValue({ id: 'event-1', status: 'PUBLISHED' }) },
    eventProgramItem: { findFirst: itemFindFirst, findMany: itemsFind },
    programAttendanceLink: { findUnique: linkFind, findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    programAttendance: { findUnique: attendanceFind, create: attendanceCreate, findMany: jest.fn().mockResolvedValue([]) },
    pointTransaction: { findUnique: jest.fn().mockResolvedValue(null) },
    eventStudentPoints: { findUnique: jest.fn().mockResolvedValue(null) },
    programEnrollment: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((callback: (tx: any) => unknown) => callback(transactionTx)),
  } as unknown as PrismaService, { assertEventAccess: jest.fn().mockResolvedValue(undefined) } as unknown as EventAccessService,
    { recordMovement: ledgerRecord } as unknown as LedgerService);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-08T09:30:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('creates high-entropy URLs but persists only the SHA-256 hash', async () => {
    const result = await service.createLink('item-1', 'admin-1', 'innovation-week');
    expect(result.data.token).toHaveLength(43);
    expect(result.data.token).not.toBe(tokenHash);
    const storedHash = transactionTx.programAttendanceLink.create.mock.calls[0][0].data.tokenHash;
    expect(storedHash).toBe(createHash('sha256').update(result.data.token).digest('hex'));
    expect(storedHash).not.toBe(result.data.token);
    expect(result.data.kind).toBe('ATTENDANCE');
    expect(transactionTx.programAttendanceLink.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { programItemId: 'item-1', kind: 'ATTENDANCE', revokedAt: null } }));
  });

  it('creates links and accepts check-ins for published non-talk program items', async () => {
    itemFindFirst.mockImplementationOnce(({ where }: { where: { id: string } }) => Promise.resolve(item({
      id: where.id,
      title: 'Actividad central',
      type: 'ACTIVITY',
    })));
    const created = await service.createLink('activity-1', 'admin-1', 'innovation-week');
    expect(created.data.token).toHaveLength(43);

    linkFind.mockResolvedValue({ tokenHash: createHash('sha256').update(created.data.token).digest('hex'), revokedAt: null, programItem: item({
      id: 'activity-1',
      title: 'Actividad central',
      type: 'ACTIVITY',
    }) });
    attendanceFind.mockResolvedValue(null);
    attendanceCreate.mockResolvedValue({ id: 'activity-attendance', checkedInAt: new Date() });

    await expect(service.preview('user-1', created.data.token)).resolves.toMatchObject({
      data: { item: { id: 'activity-1', title: 'Actividad central' }, alreadyConfirmed: false },
    });
    await expect(service.confirm('user-1', created.data.token)).resolves.toMatchObject({
      data: { item: { id: 'activity-1', title: 'Actividad central' }, alreadyConfirmed: false },
    });
    expect(attendanceCreate).toHaveBeenCalledWith({ data: { userId: 'user-1', programItemId: 'activity-1', method: 'NFC_LINK' } });
  });

  it('still rejects links for unpublished program items', async () => {
    itemFindFirst.mockResolvedValueOnce(item({ id: 'draft-item', status: 'DRAFT', type: 'ACTIVITY' }));
    await expect(service.createLink('draft-item', 'admin-1', 'innovation-week')).rejects.toThrow(/elementos publicados del cronograma/i);
    expect(transactionTx.programAttendanceLink.create).not.toHaveBeenCalled();
  });

  it('keeps generated links isolated to their own program talk', async () => {
    const first = await service.createLink('talk-1', 'admin-1', 'innovation-week');
    const second = await service.createLink('talk-2', 'admin-1', 'innovation-week');
    const persisted = transactionTx.programAttendanceLink.create.mock.calls.map(([args]) => args.data);

    expect(first.data.token).not.toBe(second.data.token);
    expect(persisted).toEqual([
      { programItemId: 'talk-1', tokenHash: createHash('sha256').update(first.data.token).digest('hex'), createdById: 'admin-1', kind: 'ATTENDANCE' },
      { programItemId: 'talk-2', tokenHash: createHash('sha256').update(second.data.token).digest('hex'), createdById: 'admin-1', kind: 'ATTENDANCE' },
    ]);
  });

  it('persists once for an enrolled or unregistered user and makes retries idempotent', async () => {
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: item() });
    attendanceFind.mockResolvedValue(null);
    attendanceCreate.mockResolvedValue({ id: 'attendance-1', checkedInAt: new Date() });
    const first = await service.confirm('user-1', token);
    expect(first.data.alreadyConfirmed).toBe(false);
    expect(attendanceCreate).toHaveBeenCalledWith({ data: { userId: 'user-1', programItemId: 'item-1', method: 'NFC_LINK' } });
    attendanceFind.mockResolvedValue({ id: 'attendance-1' });
    const retry = await service.confirm('user-1', token);
    expect(retry.data.alreadyConfirmed).toBe(true);
    expect(attendanceCreate).toHaveBeenCalledTimes(1);
  });

  it('awards the configured activity points atomically for a program attendance', async () => {
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: item() });
    attendanceFind.mockResolvedValue(null);
    attendanceCreate.mockResolvedValue({ id: 'attendance-scored', checkedInAt: new Date() });
    activityFind.mockResolvedValue({ id: 'activity-1', pointsValue: 10 });
    transactionTx.eventStudentPoints.findUnique.mockResolvedValue({ totalPoints: 10 });

    const result = await service.confirm('user-1', token);

    expect(result.data).toMatchObject({ alreadyConfirmed: false, pointsAwarded: 10, newTotal: 10 });
    expect(ledgerRecord).toHaveBeenCalledWith(transactionTx, expect.objectContaining({
      eventId: 'event-1',
      studentId: 'user-1',
      activityId: 'activity-1',
      programAttendanceId: 'attendance-scored',
      idempotencyKey: 'checkin:activity-1:user-1',
      points: 10,
    }));
  });

  it('awards the exhibitor bonus once, including when attendance already exists', async () => {
    linkFind.mockResolvedValue({ tokenHash, kind: 'EXHIBITOR', revokedAt: null, programItem: item() });
    attendanceFind.mockResolvedValue({ id: 'attendance-existing', checkedInAt: new Date(), pointTransaction: { points: 10 } });
    transactionTx.pointTransaction.findUnique.mockResolvedValue(null);
    transactionTx.eventStudentPoints.findUnique.mockResolvedValue({ totalPoints: 25 });

    const result = await service.confirm('user-1', token);

    expect(result.data).toMatchObject({ alreadyConfirmed: true, pointsAwarded: 10, bonusPointsAwarded: 15, newTotal: 25, kind: 'EXHIBITOR' });
    expect(ledgerRecord).toHaveBeenCalledWith(transactionTx, expect.objectContaining({
      type: 'BONUS', points: 15, studentId: 'user-1', eventId: 'event-1',
      idempotencyKey: 'program-attendance-exhibitor:item-1:user-1',
    }));
    expect(attendanceCreate).not.toHaveBeenCalled();
  });

  it('does not award NFC points again when the user already earned activity points by another check-in path', async () => {
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: item() });
    attendanceFind.mockResolvedValue(null);
    attendanceCreate.mockResolvedValue({ id: 'attendance-already-scored', checkedInAt: new Date() });
    activityFind.mockResolvedValue({ id: 'activity-1', pointsValue: 10 });
    transactionTx.pointTransaction.findUnique.mockResolvedValue({ id: 'prior-award' });
    transactionTx.eventStudentPoints.findUnique.mockResolvedValue({ totalPoints: 10 });

    const result = await service.confirm('user-1', token);

    expect(result.data).toMatchObject({ pointsAwarded: 0, newTotal: 10 });
    expect(ledgerRecord).not.toHaveBeenCalled();
  });

  it('previews the talk without writing an attendance row', async () => {
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: item() });
    attendanceFind.mockResolvedValue(null);
    const result = await service.preview('user-1', token);
    expect(result.data.item.title).toBe('Charla');
    expect(result.data.alreadyConfirmed).toBe(false);
    expect(attendanceCreate).not.toHaveBeenCalled();
    expect((service as any).eventAccess.assertEventAccess).toHaveBeenCalledWith('user-1', 'innovation-week');
  });

  it('keeps preview and confirmation available after the talk date while its link remains active', async () => {
    const endedTalk = item({ startsAt: new Date('2020-11-08T09:00:00Z'), endsAt: new Date('2020-11-08T10:00:00Z') });
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: endedTalk });
    attendanceFind.mockResolvedValue(null);
    attendanceCreate.mockResolvedValue({ id: 'late-attendance', checkedInAt: new Date() });

    await expect(service.preview('late-user', token)).resolves.toMatchObject({ data: { item: { title: 'Charla' }, alreadyConfirmed: false } });
    await expect(service.confirm('late-user', token)).resolves.toMatchObject({ data: { alreadyConfirmed: false } });
    expect(attendanceCreate).toHaveBeenCalledWith({ data: { userId: 'late-user', programItemId: 'item-1', method: 'NFC_LINK' } });
  });

  it('rejects invalid and revoked links, and confirms a talk long after its scheduled end', async () => {
    await expect(service.confirm('user-1', 'bad-token')).rejects.toThrow();
    linkFind.mockResolvedValue({ tokenHash, revokedAt: new Date(), programItem: item() });
    await expect(service.confirm('user-1', token)).rejects.toThrow(/revocado/i);
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: item({ status: 'CANCELLED' }) });
    await expect(service.confirm('user-1', token)).rejects.toThrow(/cancelada/i);
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: item({ startsAt: new Date('2020-11-08T09:00:00Z'), endsAt: new Date('2020-11-08T10:00:00Z') }) });
    attendanceFind.mockResolvedValue(null);
    attendanceCreate.mockResolvedValue({ id: 'attendance-after-event', checkedInAt: new Date() });
    await expect(service.confirm('user-after-event', token)).resolves.toMatchObject({ data: { alreadyConfirmed: false, item: { id: 'item-1' } } });
    expect(attendanceCreate).toHaveBeenCalledWith({ data: { userId: 'user-after-event', programItemId: 'item-1', method: 'NFC_LINK' } });
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: item({ status: 'CANCELLED' }) });
    await expect(service.confirm('user-2', token)).rejects.toThrow(/cancelada/i);
  });

  it('allows an unlimited number of distinct users to use the same active talk link', async () => {
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: item({ endsAt: new Date('2020-11-08T10:00:00Z') }) });
    attendanceFind.mockResolvedValue(null);
    attendanceCreate.mockImplementation(({ data }: { data: { userId: string } }) => Promise.resolve({ id: `attendance-${data.userId}`, checkedInAt: new Date() }));
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => service.confirm(`visitor-${index}`, token)));
    expect(results.every((result) => result.data.alreadyConfirmed === false)).toBe(true);
    expect(attendanceCreate).toHaveBeenCalledTimes(12);
  });

  it('rejects access outside BizWeek and checks authorization for a valid link', async () => {
    await expect(service.createLink('item-1', 'admin-1', 'tedxucb')).rejects.toThrow(/BizWeek/i);
    linkFind.mockResolvedValue({ tokenHash, revokedAt: null, programItem: item() });
    attendanceFind.mockResolvedValue(null);
    await service.confirm('user-1', token);
    expect((service as any).eventAccess.assertEventAccess).toHaveBeenCalledWith('user-1', 'innovation-week');
  });

  it('returns real per-talk profile states rather than deriving attendance from clock time', async () => {
    itemsFind.mockResolvedValue([
      { ...item(), enrollments: [], attendances: [] },
      { ...item({ id: 'item-2', type: 'ACTIVITY', endsAt: new Date('2026-11-08T09:00:00Z') }), enrollments: [{ createdAt: new Date() }], attendances: [] },
      { ...item({ id: 'item-3' }), enrollments: [], attendances: [{ checkedInAt: new Date(), method: 'NFC_LINK' }] },
    ]);
    const result = await service.myProgramStatus('user-1', 'innovation-week');
    expect(result.data.map((row) => row.state)).toEqual(['NOT_ENROLLED', 'ENROLLED_NO_ATTENDANCE', 'ATTENDED']);
    expect(itemsFind).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: 'event-1', status: { in: ['PUBLISHED', 'CANCELLED'] } } }));
  });
});
