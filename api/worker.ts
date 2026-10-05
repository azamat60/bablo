import * as budget from './budget';
import * as text from './ai/text';
import * as receipt from './ai/receipt';
import * as voice from './ai/voice';
import * as statement from './ai/statement';
import * as insights from './ai/insights';
import { configureRuntimeEnvironment } from './_lib/environment';
import { apiError, noStore } from './_lib/security';

type ApiRoute = Partial<Record<string, (request: Request) => Promise<Response>>>;
type WorkerEnv = Record<string, unknown> & { ASSETS: { fetch(request: Request): Promise<Response> } };
const routes: Record<string, ApiRoute> = {
  '/api/budget': { GET: budget.GET, PUT: budget.PUT },
  '/api/ai/text': { POST: text.POST },
  '/api/ai/receipt': { POST: receipt.POST },
  '/api/ai/voice': { POST: voice.POST },
  '/api/ai/statement': { POST: statement.POST },
  '/api/ai/insights': { POST: insights.POST },
};
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    configureRuntimeEnvironment(env);
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const route = routes[url.pathname];
      if (!route) return Response.json({ error: 'Не найдено.' }, { status: 404, headers: noStore });
      const handler = route[request.method];
      if (!handler)
        return Response.json(
          { error: 'Метод не поддерживается.' },
          {
            status: 405,
            headers: { ...noStore, Allow: Object.keys(route).join(', ') },
          },
        );
      try {
        return await handler(request);
      } catch (error) {
        return apiError(error);
      }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    if (url.pathname === '/privacy') url.pathname = '/privacy.html';
    const asset = await env.ASSETS.fetch(new Request(url, request));
    if (asset.status !== 404 || !request.headers.get('Accept')?.includes('text/html')) return asset;
    url.pathname = '/index.html';
    return env.ASSETS.fetch(new Request(url, request));
  },
};
