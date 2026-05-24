import { createClient } from "@supabase/supabase-js";

export async function getUserFromBearer(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, error: "missing_token" as const };
  }
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return { user: null, error: "missing_token" as const };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { user: null, error: "invalid_token" as const };
  return { user, error: null };
}
