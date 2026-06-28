export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Dispatched on any 401 so the auth layer can redirect to /login. */
export const UNAUTHORIZED_EVENT = 'vh-unauthorized';

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = await parse(res);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `request failed (${res.status})`;
    throw new ApiError(res.status, msg, (body as { details?: unknown })?.details);
  }
  return body as T;
}

const json = { 'content-type': 'application/json' };

export const api = {
  get: <T>(path: string): Promise<T> => fetch(path, { credentials: 'include' }).then((r) => handle<T>(r)),

  post: <T>(path: string, body?: unknown): Promise<T> =>
    fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: body === undefined ? undefined : json,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),

  patch: <T>(path: string, body: unknown): Promise<T> =>
    fetch(path, { method: 'PATCH', credentials: 'include', headers: json, body: JSON.stringify(body) }).then((r) =>
      handle<T>(r),
    ),

  del: <T>(path: string): Promise<T> =>
    fetch(path, { method: 'DELETE', credentials: 'include' }).then((r) => handle<T>(r)),

  /** multipart upload (project create/reupload). */
  upload: <T>(path: string, form: FormData): Promise<T> =>
    fetch(path, { method: 'POST', credentials: 'include', body: form }).then((r) => handle<T>(r)),
};
