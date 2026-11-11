import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { createDebouncedTrigger, withMenuWriteWatch } from "@/lib/supabase/menu-write-watch";

let browserClient: SupabaseClient | null = null;

const MENU_CACHE_REFRESH_DELAY_MS = 800;

/** Menü kaydından sonra QR menü önbelleğini temizletir; hata olursa sessizce geçer (menü ~1 dk içinde yine güncellenir). */
async function requestPublicMenuCacheRefresh() {
  try {
    const client = browserClient;
    if (!client) return;
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session?.access_token) return;
    await fetch("/api/menu/cache-refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      keepalive: true,
    });
  } catch (error) {
    console.warn("[menu-cache] yenileme isteği gönderilemedi", error);
  }
}

const menuCacheRefresh = createDebouncedTrigger(() => {
  void requestPublicMenuCacheRefresh();
}, MENU_CACHE_REFRESH_DELAY_MS);

/** Tek GoTrue instance — login / admin / master / import aynı oturumu paylaşır. */
export function getBrowserSupabase(): SupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    browserClient = createClient(url, key, {
      global: { fetch: withMenuWriteWatch((...args) => fetch(...args), () => menuCacheRefresh.schedule()) },
    });
  }
  return browserClient;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * İlk mount'ta getSession() bazen null döner; kısa retry + getUser fallback.
 */
export async function waitForBrowserSession(options?: {
  maxAttempts?: number;
  delayMs?: number;
}): Promise<Session | null> {
  const supabase = getBrowserSupabase();
  const maxAttempts = options?.maxAttempts ?? 8;
  const delayMs = options?.delayMs ?? 80;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return session;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const {
        data: { session: retrySession },
      } = await supabase.auth.getSession();
      if (retrySession) return retrySession;
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}
