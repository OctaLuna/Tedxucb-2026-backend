import { parseReconcileArgs } from '../../../src/cli/points-cli';

describe('parseReconcileArgs (points-cli, T046, sin proceso)', () => {
  it('parsea --student', () => {
    expect(parseReconcileArgs(['--student', '202012345'])).toEqual({
      student: '202012345',
      all: false,
      fix: false,
      json: false,
    });
  });

  it('parsea --all --json', () => {
    expect(parseReconcileArgs(['--all', '--json'])).toEqual({ all: true, fix: false, json: true });
  });

  it('parsea --all --fix --operator', () => {
    expect(parseReconcileArgs(['--all', '--fix', '--operator', 'admin@ucb.edu.bo'])).toEqual({
      all: true,
      fix: true,
      operator: 'admin@ucb.edu.bo',
      json: false,
    });
  });

  it('rechaza sin --student ni --all', () => {
    expect(() => parseReconcileArgs(['--json'])).toThrow(/--student.*--all/);
  });

  it('rechaza --student y --all a la vez', () => {
    expect(() => parseReconcileArgs(['--student', '202012345', '--all'])).toThrow(/mutuamente excluyentes/);
  });

  it('rechaza --fix sin --operator', () => {
    expect(() => parseReconcileArgs(['--all', '--fix'])).toThrow(/--operator/);
  });

  it('rechaza una flag desconocida', () => {
    expect(() => parseReconcileArgs(['--nope'])).toThrow(/Flag desconocida/);
  });
});
