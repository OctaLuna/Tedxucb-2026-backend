import { PendingProgramAttendanceService } from './pending-program-attendance.service';

describe('PendingProgramAttendanceService', () => {
  const item = {
    id: 'item-1', title: 'Actividad central: Expo Marketing (todo el día)',
    event: { id: 'event-1', slug: 'innovation-week' },
    activity: { id: 'activity-1', pointsValue: 10 },
  };
  const claim = {
    id: 'claim-1', programItemId: 'item-1', attendancePoints: 10, exhibitorBonusPoints: 15,
  };
  let tx: any;
  let prisma: any;
  let ledger: any;
  let service: PendingProgramAttendanceService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      pendingProgramAttendanceClaim: { findMany: jest.fn().mockResolvedValue([claim]), update: jest.fn() },
      eventProgramItem: { findUnique: jest.fn().mockResolvedValue(item) },
      programAttendance: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attendance-1' }) },
      pointTransaction: { findUnique: jest.fn().mockResolvedValue(null) },
      programAttendanceNotification: { create: jest.fn() },
    };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: 'person@ucb.edu.bo', status: 'ACTIVE', roles: [{ role: 'ALUMNO' }] }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      programAttendanceNotification: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    ledger = { recordMovement: jest.fn().mockImplementation(async (_client, movement) => ({ id: `movement-${movement.type}`, points: movement.points })) };
    service = new PendingProgramAttendanceService(prisma, ledger);
  });

  it('creates one normal attendance, base award and exhibitor bonus under distinct idempotency keys', async () => {
    await service.claimForUser('user-1');

    expect(tx.programAttendance.create).toHaveBeenCalledWith({ data: { userId: 'user-1', programItemId: 'item-1', method: 'MANUAL_ROSTER' } });
    expect(ledger.recordMovement).toHaveBeenCalledTimes(2);
    expect(ledger.recordMovement.mock.calls.map(([, movement]: any) => movement)).toEqual(expect.arrayContaining([
      expect.objectContaining({ points: 10, type: 'ACTIVITY', idempotencyKey: 'checkin:activity-1:user-1', programAttendanceId: 'attendance-1' }),
      expect.objectContaining({ points: 15, type: 'BONUS', idempotencyKey: 'program-attendance-exhibitor:item-1:user-1' }),
    ]));
    expect(tx.programAttendanceNotification.create.mock.calls.map(([input]: any) => input.data)).toEqual([
      { userId: 'user-1', programItemId: 'item-1', kind: 'ATTENDANCE', points: 10, deferUntilAvatarSaved: true },
      { userId: 'user-1', programItemId: 'item-1', kind: 'EXHIBITOR', points: 15, deferUntilAvatarSaved: true },
    ]);
    expect(tx.pendingProgramAttendanceClaim.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'claim-1' }, data: expect.objectContaining({ status: 'CLAIMED', claimedById: 'user-1' }) }));
  });

  it('adds only a missing exhibitor bonus when normal attendance and its award already exist', async () => {
    tx.programAttendance.findUnique.mockResolvedValue({ id: 'attendance-existing' });
    tx.pointTransaction.findUnique.mockResolvedValueOnce({ id: 'base-existing' }).mockResolvedValueOnce(null);

    await service.claimForUser('user-1');

    expect(tx.programAttendance.create).not.toHaveBeenCalled();
    expect(ledger.recordMovement).toHaveBeenCalledTimes(1);
    expect(ledger.recordMovement.mock.calls[0][1]).toMatchObject({ type: 'BONUS', points: 15, idempotencyKey: 'program-attendance-exhibitor:item-1:user-1' });
    expect(tx.programAttendanceNotification.create).toHaveBeenCalledWith({ data: {
      userId: 'user-1', programItemId: 'item-1', kind: 'EXHIBITOR', points: 15, deferUntilAvatarSaved: true,
    } });
  });

  it('does not process non-student or inactive accounts', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'person@ucb.edu.bo', status: 'PENDING', roles: [] });

    await service.claimForUser('user-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(ledger.recordMovement).not.toHaveBeenCalled();
  });
});
