import type { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { QrTokenService } from '../../../src/modules/activities/qr-token.service';
import type { AppException } from '../../../src/common/exceptions/app.exception';
import type { EnvConfig } from '../../../src/config/env.validation';

function makeService(secret = 'b'.repeat(32)): QrTokenService {
  const fakeConfig = { get: () => secret } as unknown as ConfigService<EnvConfig, true>;
  return new QrTokenService(fakeConfig);
}

function expectAppException(action: () => unknown, statusCode: number, error: string) {
  expect.assertions(2);
  try {
    action();
  } catch (thrown) {
    expect((thrown as AppException).getStatus()).toBe(statusCode);
    expect((thrown as AppException).error).toBe(error);
  }
}

describe('QrTokenService (T012, sin BD)', () => {
  const studentId = '3c9d9a2e-8f1a-4b3a-9f4a-2b1e6a7c9d10';

  it('emite un token que verify() reconoce, con el studentId correcto', () => {
    const service = makeService();

    const { token } = service.issue(studentId);
    const { studentId: verifiedId } = service.verify(token);

    expect(verifiedId).toBe(studentId);
  });

  it('rechaza con INVALID_QR_TOKEN una firma manipulada', () => {
    const service = makeService();
    const { token } = service.issue(studentId);
    const [payload] = token.split('.');

    expectAppException(() => service.verify(`${payload}.firma-invalida`), 400, 'INVALID_QR_TOKEN');
  });

  it('rechaza con INVALID_QR_TOKEN un token malformado (sin punto separador)', () => {
    const service = makeService();

    expectAppException(() => service.verify('esto-no-es-un-token'), 400, 'INVALID_QR_TOKEN');
  });

  it('rechaza con EXPIRED_QR_TOKEN y expiredAt un token vencido, firmado por el mismo secreto', () => {
    const secret = 'c'.repeat(32);
    const service = makeService(secret);
    const now = Math.floor(Date.now() / 1000);
    const payload = { sid: studentId, iat: now - 120, exp: now - 60 };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

    expect.assertions(3);
    try {
      service.verify(`${encodedPayload}.${signature}`);
    } catch (thrown) {
      expect((thrown as AppException).getStatus()).toBe(401);
      expect((thrown as AppException).error).toBe('EXPIRED_QR_TOKEN');
      expect((thrown as AppException).details?.expiredAt).toBe(new Date(payload.exp * 1000).toISOString());
    }
  });
});
