/** Fetch to same-origin /api with session cookies */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...init?.headers,
    },
  });
}
