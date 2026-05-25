export async function masterJsonFetch<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; status: number; error?: string }> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    return { ok: false, status: res.status, error: data.error };
  }
  return { ok: true, data };
}
