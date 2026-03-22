const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export function getApiBaseUrl() {
  return API_BASE_URL;
}

/** NestJS / common JSON error bodies: { message: string | string[] } */
async function readHttpErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;
  try {
    const j = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof j.message === 'string') return j.message;
    if (Array.isArray(j.message)) return j.message.map(String).join(', ');
    if (typeof j.error === 'string') return j.error;
  } catch {
    /* not JSON */
  }
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

export function getApiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(await readHttpErrorMessage(response));
  }
  return (await response.json()) as T;
}

export async function apiGetWithHeaders<T>(path: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) {
    throw new Error(await readHttpErrorMessage(response));
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readHttpErrorMessage(response));
  }
  return (await response.json()) as T;
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readHttpErrorMessage(response));
  }
  return (await response.json()) as T;
}

export async function apiDelete<T>(path: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: {
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(await readHttpErrorMessage(response));
  }
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
