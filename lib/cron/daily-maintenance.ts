/**
 * Günlük bakım (Vercel Cron):
 *  1) Bitiş tarihi geçmiş "active" abonelikleri "expired" olarak işaretler (restoran satırı + olay kaydı).
 *     Erişim kontrolleri zaten tarihi dinamik okur; işaretleme kayıt/raporlama ve menü önbelleğini
 *     anında kapatmak içindir. "suspended" restoranlara dokunulmaz.
 *  2) Süresi dolmuş menü yedeklerini (menu_snapshots.expires_at) siler.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { purgePublicMenuCache } from "@/lib/public-menu/cache-purge";

export type ExpireResult = { expired: string[]; failed: string[] };

type DueRow = { restaurant_id: string; ends_at: string | null };

export async function markExpiredSubscriptions(
  admin: SupabaseClient,
  now: Date = new Date(),
  purge: typeof purgePublicMenuCache = purgePublicMenuCache
): Promise<ExpireResult> {
  const nowIso = now.toISOString();
  const { data, error } = await admin
    .from("restaurant_subscriptions")
    .select("restaurant_id, ends_at")
    .eq("status", "active")
    .not("ends_at", "is", null)
    .lt("ends_at", nowIso);
  if (error) throw new Error(`süresi dolan abonelikler okunamadı: ${error.message}`);

  const expired: string[] = [];
  const failed: string[] = [];
  for (const row of (data ?? []) as DueRow[]) {
    const id = row.restaurant_id;
    try {
      // Koşullu güncelleme: bu arada biri süreyi uzattıysa veya pasife aldıysa dokunma.
      const { data: updated, error: subError } = await admin
        .from("restaurant_subscriptions")
        .update({ status: "expired" })
        .eq("restaurant_id", id)
        .eq("status", "active")
        .lt("ends_at", nowIso)
        .select("restaurant_id");
      if (subError) throw subError;
      if (!updated || updated.length === 0) continue;

      const { error: restError } = await admin
        .from("restaurants")
        .update({ tenant_status: "expired" })
        .eq("id", id)
        .eq("tenant_status", "active");
      if (restError) throw restError;

      const { error: eventError } = await admin.from("subscription_events").insert({
        restaurant_id: id,
        event_type: "expired",
        created_by: null,
        old_values: { status: "active", ends_at: row.ends_at },
        new_values: { status: "expired", source: "cron" },
      });
      if (eventError) console.error("[cron] olay kaydı yazılamadı", id, eventError);

      expired.push(id);
    } catch (err) {
      console.error("[cron] abonelik işaretlenemedi", id, err);
      failed.push(id);
    }
  }

  if (expired.length > 0) await purge(expired);
  return { expired, failed };
}

export async function deleteExpiredMenuSnapshots(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<number> {
  const { data, error } = await admin
    .from("menu_snapshots")
    .delete()
    .lt("expires_at", now.toISOString())
    .select("id");
  if (error) throw new Error(`eski menü yedekleri silinemedi: ${error.message}`);
  return data?.length ?? 0;
}

/**
 * Bitiş tarihi değişince durumun ne olacağı: "expired" bir abonelik ileri bir tarihe
 * (veya süresiz) taşındıysa yeniden "active" olur. "suspended" bilinçli bir karardır, korunur.
 */
export function statusAfterEndDateChange(
  currentStatus: string,
  newEndsAt: string | null,
  now: Date = new Date()
): string {
  if (currentStatus !== "expired") return currentStatus;
  if (newEndsAt === null) return "active";
  const end = new Date(newEndsAt);
  if (Number.isNaN(end.getTime())) return currentStatus;
  return end.getTime() > now.getTime() ? "active" : currentStatus;
}

/** Vercel Cron, CRON_SECRET tanımlıysa "Authorization: Bearer <secret>" gönderir. Gizli anahtar yoksa reddet. */
export function isAuthorizedCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  if (!authorization) return false;
  const expected = `Bearer ${secret}`;
  if (authorization.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= authorization.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
