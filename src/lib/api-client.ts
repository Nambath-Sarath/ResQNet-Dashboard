/**
 * Typed REST client for ResQNet API (/api/v1/*).
 * Used from client components via TanStack Query.
 */

export type ApiError = {
  code: string
  message: string
  request_id?: string | null
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'same-origin',
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = null
    }
  }

  if (!res.ok) {
    const err = (body as { error?: ApiError } | null)?.error
    throw new ApiRequestError(
      err?.message ?? `Request failed (${res.status})`,
      err?.code ?? 'UNKNOWN',
      res.status,
    )
  }
  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
