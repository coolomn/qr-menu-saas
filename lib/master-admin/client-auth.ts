/** Giriş sonrası yönlendirme: master admin ise /admin/master, değilse /admin. */
export async function resolvePostLoginPath(accessToken: string): Promise<"/admin/master" | "/admin"> {
  try {
    const res = await fetch("/api/master/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return "/admin/master";
  } catch {
    // Ağ hatasında owner paneline düş
  }
  return "/admin";
}

export function masterLoginUrl(nextPath = "/admin/master"): string {
  return `/admin/login?next=${encodeURIComponent(nextPath)}`;
}
