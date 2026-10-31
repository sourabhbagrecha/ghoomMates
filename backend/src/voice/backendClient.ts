// Tiny fetch wrapper the agent worker uses to call our own HTTP API as the signed-in user.

export class BackendError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.code = code;
  }
}

export type BackendClient = {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown, options?: { idempotencyKey?: string }): Promise<T>;
};

export const defaultBackendUrl = () => process.env.BACKEND_URL?.trim() || `http://127.0.0.1:${process.env.PORT || 3000}`;

export function createBackendClient({ baseUrl = defaultBackendUrl(), authToken }: { baseUrl?: string; authToken: string }): BackendClient {
  const root = baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${authToken}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let res: Response;
    try {
      res = await fetch(`${root}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new BackendError(0, 'NETWORK_ERROR', `Couldn't reach the Ghoomates server (${(err as Error).message})`);
    }
    const data = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    if (!res.ok) {
      throw new BackendError(res.status, data?.error?.code ?? 'HTTP_ERROR', data?.error?.message ?? `Request failed with status ${res.status}`);
    }
    return data as T;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body, options) => request('POST', path, body, options?.idempotencyKey),
  };
}
