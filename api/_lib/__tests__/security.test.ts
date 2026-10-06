import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PUT } from '../../budget';
import { POST as textPost } from '../../ai/text';
import { readJson, readMultipart, withAiAttempt } from '../security';
import { emptyLedger } from '../../../shared/ledger';
const mocked = vi.hoisted(() => ({ claims: vi.fn(), from: vi.fn(), rpc: vi.fn(), provider: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getClaims: mocked.claims }, from: mocked.from, rpc: mocked.rpc }),
}));
vi.mock('../openai', () => ({
  getOpenAIClient: mocked.provider,
  MissingApiKeyError: class extends Error {},
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'publish');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'server');
  mocked.claims.mockResolvedValue({ data: { claims: { sub: 'user-a', is_anonymous: false } }, error: null });
  mocked.rpc.mockResolvedValue({ data: { allowed: true }, error: null });
});
const req = (body: unknown, token = true) =>
  new Request('http://localhost/api/budget', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer token' } : {}) },
    body: JSON.stringify(body),
  });
describe('API boundaries', () => {
  it('rejects anonymous and forged Sites owner', async () => {
    const request = new Request('http://localhost/api/budget', { headers: { 'X-OpenAI-User-ID': 'user-a' } });
    expect((await GET(request)).status).toBe(401);
    expect(mocked.from).not.toHaveBeenCalled();
    expect((await textPost(new Request('http://localhost/api/ai/text', { method: 'POST', body: '{}' }))).status).toBe(
      401,
    );
  });
  it('null JSON is 400 before database or identity lookup', async () => {
    expect((await PUT(req(null))).status).toBe(400);
    expect(mocked.claims).not.toHaveBeenCalled();
    expect(mocked.from).not.toHaveBeenCalled();
  });
  it('counts UTF-8 bytes and rejects oversized request', async () => {
    const request = new Request('http://localhost/api/budget', {
      method: 'PUT',
      body: JSON.stringify({ x: 'я'.repeat(1_500_200) }),
    });
    expect((await PUT(request)).status).toBe(413);
    expect(mocked.from).not.toHaveBeenCalled();
  });
  it('invalid JWT never queries budget', async () => {
    mocked.claims.mockResolvedValue({ data: null, error: { status: 401 } });
    expect((await PUT(req({ state: emptyLedger(), revision: 0 }))).status).toBe(401);
    expect(mocked.from).not.toHaveBeenCalled();
  });
  it('blocks cross-origin writes', async () => {
    const request = req({ state: emptyLedger(), revision: 0 });
    request.headers.set('Origin', 'https://attacker.example');
    expect((await PUT(request)).status).toBe(403);
    expect(mocked.claims).not.toHaveBeenCalled();
  });
  it('AI quota denial includes Retry-After', async () => {
    mocked.rpc.mockResolvedValue({ data: { allowed: false, retry_after: 123 }, error: null });
    const run = vi.fn();
    const request = new Request('http://localhost/api/ai/text', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    });
    const response = await withAiAttempt(request, run);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('123');
    expect(run).not.toHaveBeenCalled();
  });
  it('releases active AI lease on parser failure', async () => {
    const request = new Request('http://localhost/api/ai/text', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    });
    expect((await withAiAttempt(request, () => Promise.reject(new Error('private error')))).status).toBe(503);
    expect(mocked.rpc.mock.calls.map((call) => String(call[0]))).toEqual(['acquire_ai_attempt', 'release_ai_attempt']);
  });
  it('does not truncate long AI text or call provider', async () => {
    const response = await textPost(
      new Request('http://localhost/api/ai/text', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
        body: JSON.stringify({ text: 'a'.repeat(20001), context: {} }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocked.provider).not.toHaveBeenCalled();
  });
  it('returns 400 for malformed UTF8 and JSON', async () => {
    await expect(
      readJson(new Request('http://localhost/api', { method: 'POST', body: new Uint8Array([255]) }), 100),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('bounds multipart before loading complete upload', async () => {
    const data = new FormData();
    data.set('file', new Blob(['x'.repeat(1000)]));
    const encoded = new Request('http://localhost/api', { method: 'POST', body: data });
    const bytes = await encoded.arrayBuffer();
    await expect(
      readMultipart(new Request('http://localhost/api', { method: 'POST', headers: encoded.headers, body: bytes }), 10),
    ).rejects.toMatchObject({ status: 413 });
  });
});
