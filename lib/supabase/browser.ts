import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/** Tek GoTrue instance — login / admin / master / import aynı oturumu paylaşır. */
export function getBrowserSupabase(): SupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    browserClient = createClient(url, key);
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
