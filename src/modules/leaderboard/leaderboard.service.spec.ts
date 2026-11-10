import { LeaderboardService } from './leaderboard.service';
import { AvatarBridgeTokenService } from '../auth/avatar-bridge-token.service';
import { createHmac } from 'node:crypto';

const avatarApiBase = 'https://bizweek.example/avatar/api/v1/';
const publicPreviewBase = 'https://bizweek.adm-ucb.lat/avatar/api/v1/';
const userWithAvatar = '00000000-0000-4000-8000-000000000101';
const userWithoutAvatar = '00000000-0000-4000-8000-000000000102';
const reference = {
  contractVersion: 1 as const,
  provider: 'avatar-2d' as const,
  avatarId: 'avatar-101',
  revision: '4',
  preview: { mediaType: 'image/png' as const, url: `${avatarApiBase}previews/avatar-101/4.png` },
};

function createService(options: { apiBaseUrl?: string; previewBaseUrl?: string; nodeEnv?: string } = {}) {
  const apiBaseUrl = options.apiBaseUrl === undefined ? avatarApiBase : options.apiBaseUrl;
  const previewBaseUrl = options.previewBaseUrl === undefined ? apiBaseUrl : options.previewBaseUrl;
  const nodeEnv = options.nodeEnv ?? 'test';
  const rows = [
    { student_id: userWithAvatar, full_name: 'Ari', career: 'Economía', total_points: 20, position: 1, total_count: 2 },
    { student_id: userWithoutAvatar, full_name: 'Sol', career: null, total_points: 10, position: 2, total_count: 2 },
  ];
  const prisma = {
    event: { findUnique: jest.fn().mockResolvedValue({ id: 'event-innovation-week', slug: 'innovation-week' }) },
    $queryRaw: jest.fn().mockResolvedValue(rows),
  };
  const config = { get: jest.fn((key: string) => ({
    AVATAR_2D_API_BASE_URL: apiBaseUrl,
    AVATAR_2D_PREVIEW_BASE_URL: previewBaseUrl,
    NODE_ENV: nodeEnv,
  }[key])) };
  const avatarBridge = { issueLeaderboardLookup: jest.fn().mockReturnValue({ token: 'signed-lookup-token', expiresAt: 'soon' }) };
  return {
    service: new LeaderboardService(prisma as never, config as never, avatarBridge as never),
    prisma,
    config,
    avatarBridge,
    rows,
  };
}

describe('LeaderboardService Avatar 2D enrichment', () => {
  afterEach(() => jest.restoreAllMocks());

  it('issues a short-lived, narrowly scoped lookup token for the Avatar 2D service', () => {
    const secret = 'avatar-bridge-test-secret-at-least-32-characters';
    const bridge = new AvatarBridgeTokenService({ get: () => secret } as never);
    const { token, expiresAt } = bridge.issueLeaderboardLookup();
    const [headerPart, claimsPart, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(claimsPart!, 'base64url').toString('utf8')) as Record<string, unknown>;

    expect(JSON.parse(Buffer.from(headerPart!, 'base64url').toString('utf8'))).toMatchObject({ alg: 'HS256', typ: 'JWT' });
    expect(claims).toMatchObject({ iss: 'tedx-ucb-backend', aud: 'avatar-2d', sub: '00000000-0000-4000-8000-000000000000', scope: 'avatar:lookup' });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(90);
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
    expect(signature).toBe(createHmac('sha256', secret).update(`${headerPart}.${claimsPart}`).digest('base64url'));
  });

  it('looks up references in one authenticated batch and attaches only public previews', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ identitySub: userWithAvatar, reference }] }),
    } as Response);
    const { service, rows } = createService();

    const result = await service.getLeaderboard({}, 100, 'innovation-week');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(`${avatarApiBase}identity/references`);
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer signed-lookup-token' } });
    expect(JSON.parse(String(init?.body))).toEqual({ identitySubs: rows.map((row) => row.student_id) });
    expect(result.data).toEqual([
      { position: 1, studentId: userWithAvatar, fullName: 'Ari', career: 'Economía', totalPoints: 20, avatar: reference },
      { position: 2, studentId: userWithoutAvatar, fullName: 'Sol', career: null, totalPoints: 10 },
    ]);
  });

  it('ignores unknown identities and unsafe preview paths', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [
        { identitySub: '00000000-0000-4000-8000-000000000999', reference },
        { identitySub: userWithAvatar, reference: { ...reference, preview: { ...reference.preview, url: 'https://untrusted.example/avatar.png' } } },
      ] }),
    } as Response);
    const { service } = createService();

    const result = await service.getLeaderboard({}, 100, 'innovation-week');

    expect(result.data.every((row) => !('avatar' in row))).toBe(true);
  });

  it('keeps ranking available when Avatar 2D is not configured or temporarily unavailable', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const unconfigured = createService({ apiBaseUrl: '', previewBaseUrl: '' });
    const withoutService = await unconfigured.service.getLeaderboard({}, 100, 'innovation-week');
    expect(withoutService.data).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    const configured = createService();
    const offline = await configured.service.getLeaderboard({}, 100, 'innovation-week');
    expect(offline.data).toHaveLength(2);
    expect(offline.data.every((row) => !('avatar' in row))).toBe(true);
  });

  it('uses the internal production service and normalizes preview URLs to the public BizWeek route', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{
        identitySub: userWithAvatar,
        reference: { ...reference, preview: { ...reference.preview, url: 'https://old-host.example/avatar/api/v1/previews/avatar-101/4.png' } },
      }] }),
    } as Response);
    const { service } = createService({ apiBaseUrl: '', previewBaseUrl: '', nodeEnv: 'production' });

    const result = await service.getLeaderboard({}, 100, 'innovation-week');

    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('http://avatar-service:4002/v1/identity/references');
    expect(result.data[0]).toMatchObject({ avatar: { preview: { url: `${publicPreviewBase}previews/avatar-101/4.png` } } });
  });
});
