import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiModule = {
  GET?: (request: Request) => Promise<Response>;
  POST?: (request: Request) => Promise<Response>;
  DELETE?: (request: Request) => Promise<Response>;
  PUT?: (request: Request) => Promise<Response>;
};

const API_ROUTES: Record<string, string> = {
  '/api/ai/receipt': '/api/ai/receipt.ts',
  '/api/ai/voice': '/api/ai/voice.ts',
  '/api/ai/text': '/api/ai/text.ts',
  '/api/ai/insights': '/api/ai/insights.ts',
};

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function toWebRequest(req: IncomingMessage, body: Buffer): Request {
  const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? ''}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && body.length > 0;
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? body : undefined,
  });
}

async function sendWebResponse(res: ServerResponse, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  const arrayBuffer = await webRes.arrayBuffer();
  res.end(Buffer.from(arrayBuffer));
}

async function handleApiRequest(
  server: ViteDevServer,
  modulePath: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const mod = (await server.ssrLoadModule(`.${modulePath}`)) as ApiModule;
    const method = (req.method ?? 'GET').toUpperCase();
    const handler = mod[method as keyof ApiModule];
    if (!handler) {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }
    const body = await readBody(req);
    const webReq = toWebRequest(req, body);
    const webRes = await handler(webReq);
    await sendWebResponse(res, webRes);
  } catch (err) {
    server.ssrFixStacktrace(err as Error);
    console.error('[api-dev]', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
}

export function apiDevPlugin(): Plugin {
  return {
    name: 'bablo-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const modulePath = API_ROUTES[url];
        if (!modulePath) {
          next();
          return;
        }
        void handleApiRequest(server, modulePath, req, res);
      });
    },
  };
}
