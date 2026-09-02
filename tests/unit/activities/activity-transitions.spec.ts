import { VALID_ACTIVITY_TRANSITIONS } from '../../../src/modules/activities/activities.constants';

describe('VALID_ACTIVITY_TRANSITIONS (máquina de estados de Activity)', () => {
  it('DRAFT solo puede pasar a PUBLISHED o CANCELLED', () => {
    expect(VALID_ACTIVITY_TRANSITIONS.DRAFT.sort()).toEqual(['CANCELLED', 'PUBLISHED']);
  });

  it('PUBLISHED solo puede pasar a CLOSED o CANCELLED, nunca de vuelta a DRAFT', () => {
    expect(VALID_ACTIVITY_TRANSITIONS.PUBLISHED.sort()).toEqual(['CANCELLED', 'CLOSED']);
    expect(VALID_ACTIVITY_TRANSITIONS.PUBLISHED).not.toContain('DRAFT');
  });

  it('CLOSED solo puede cancelarse, nunca reabrirse a PUBLISHED', () => {
    expect(VALID_ACTIVITY_TRANSITIONS.CLOSED).toEqual(['CANCELLED']);
  });

  it('CANCELLED es terminal: ninguna transición de salida', () => {
    expect(VALID_ACTIVITY_TRANSITIONS.CANCELLED).toEqual([]);
  });
});
