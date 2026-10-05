import { describe, expect, it } from 'vitest';
import worker from '../../worker';
const assets = (body = 'asset', status = 200) => ({
  fetch: () => Promise.resolve(new Response(body, { status })),
});
describe('Sites worker routing', () => {
  it('requires user JWT even when Sites headers name an owner', async () => {
    const response = await worker.fetch(
      new Request('https://bablo.example/api/budget', {
        headers: { 'OAI-Authenticated-User-ID': 'forged' },
      }),
      { ASSETS: assets() },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('never serves SPA HTML for unknown API routes or unsupported methods', async () => {
    expect((await worker.fetch(new Request('https://bablo.example/api/unknown'), { ASSETS: assets() })).status).toBe(
      404,
    );
    const response = await worker.fetch(new Request('https://bablo.example/api/budget', { method: 'DELETE' }), {
      ASSETS: assets(),
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, PUT');
  });
  it('serves callback navigation through client index and preserves asset 404', async () => {
    const paths: string[] = [];
    const ASSETS = {
      fetch: (request: Request) => {
        paths.push(new URL(request.url).pathname);
        return Promise.resolve(new Response('index', { status: paths.length === 1 ? 404 : 200 }));
      },
    };
    expect(
      (
        await worker.fetch(new Request('https://bablo.example/auth/callback', { headers: { Accept: 'text/html' } }), {
          ASSETS,
        })
      ).status,
    ).toBe(200);
    expect(paths).toEqual(['/auth/callback', '/index.html']);
    expect(
      (await worker.fetch(new Request('https://bablo.example/missing.js'), { ASSETS: assets('', 404) })).status,
    ).toBe(404);
  });
  it('exposes privacy page before sign-in', async () => {
    let path = '';
    await worker.fetch(new Request('https://bablo.example/privacy'), {
      ASSETS: {
        fetch: (request: Request) => {
          path = new URL(request.url).pathname;
          return Promise.resolve(new Response('privacy'));
        },
      },
    });
    expect(path).toBe('/privacy.html');
  });
});
