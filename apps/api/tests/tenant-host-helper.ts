import http from 'node:http';

/**
 * Configure every variable that tenant-host mode reads, so values from a developer's shell or root `.env`
 * (cookie domain, public port, extra origins) cannot change what a tenant-host test proves.
 * Call before importing the API modules.
 */
export function setTenantHostEnv(options: { baseDomain?: string; secure: boolean; origins: string }): void {
  const baseDomain = options.baseDomain ?? 'pipe.test';
  process.env['PIPE_DOMINIO_CONTAS'] = baseDomain;
  process.env['PIPE_COOKIE_DOMINIO'] = `.${baseDomain}`;
  process.env['PIPE_COOKIE_SEGURO'] = options.secure ? 'true' : 'false';
  process.env['PIPE_ORIGENS'] = options.origins;
  delete process.env['PIPE_PORTA_PUBLICA'];
}

/**
 * HTTP request that really sends the given `Host` header.
 *
 * Node's `fetch` (undici) treats `host` as a forbidden header and silently replaces it with the URL host,
 * so a fetch-based test would hit the API as `127.0.0.1` and never exercise the tenant-host guard.
 * Returns a standard `Response` so assertions read like fetch.
 */
export function requestWithHost(
  url: string,
  host: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: options.method ?? 'GET',
      headers: { ...options.headers, host },
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('error', reject);
      incoming.on('end', () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value === undefined) continue;
          for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
        }
        const status = incoming.statusCode ?? 500;
        const body = [101, 204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
        resolve(new Response(body, { status, headers }));
      });
    });
    request.on('error', reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}
