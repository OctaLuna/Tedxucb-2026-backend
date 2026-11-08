import { AuthService } from '../../src/modules/auth/auth.service';
import { AppException } from '../../src/common/exceptions/app.exception';

describe('registro de apodo y teléfono', () => {
  const updateMany = jest.fn();
  const service = new AuthService({ user: { updateMany } } as never, {} as never, {} as never, {} as never);

  beforeEach(() => { updateMany.mockReset().mockResolvedValue({ count: 1 }); });

  it('guarda ambos datos en una operación y normaliza el teléfono', async () => {
    await expect(service.updateRegistration('user-id', 'Luna7', '+591 7000-0000')).resolves.toEqual({ nickname: 'Luna7', phone: '+59170000000' });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'user-id', status: 'ACTIVE' }, data: { nickname: 'Luna7', nicknameKey: 'luna7', phone: '+59170000000' } });
  });

  it.each(['123', '+591 1234567890123456', '7000x0000', '++59170000000'])('rechaza el teléfono inválido %s sin escribir', async (phone) => {
    await expect(service.updateRegistration('user-id', 'Luna7', phone)).rejects.toBeInstanceOf(AppException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
