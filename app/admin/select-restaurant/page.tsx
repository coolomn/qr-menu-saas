"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Loader2, LogOut, UtensilsCrossed } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import {
  listOwnerRestaurantsForUser,
  type OwnerRestaurantSummary,
} from "@/lib/admin-auth/owner-restaurants";
import { setStoredRestaurantId } from "@/lib/admin-auth/owner-restaurant-selection";

const supabase = getBrowserSupabase();

export default function SelectRestaurantPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<OwnerRestaurantSummary[]>([]);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/admin/login");
        return;
      }

      const list = await listOwnerRestaurantsForUser(supabase, session.user.id);
      if (list.length === 0) {
        router.replace("/admin");
        return;
      }
      if (list.length === 1) {
        setStoredRestaurantId(session.user.id, list[0].id);
        router.replace("/admin");
        return;
      }

      setRestaurants(list);
      setLoading(false);
    })();
  }, [router]);

  const handleSelect = async (restaurantId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace("/admin/login");
      return;
    }

    setSelectingId(restaurantId);
    setStoredRestaurantId(session.user.id, restaurantId);
    router.replace("/admin");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <span className="sr-only">Yükleniyor…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src="/brand/tapmenu-mark.png"
              alt="TapMenu"
              width={56}
              height={56}
              className="h-14 w-14 object-contain"
              decoding="async"
            />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Restoran seçin</h1>
          <p className="text-gray-500 mt-2 text-sm font-medium">
            Yönetmek istediğiniz işletmeyi seçin.
          </p>
        </div>

        <div className="space-y-3">
          {restaurants.map((restaurant) => {
            const publicHref = restaurant.slug?.trim() ? `/menu/${restaurant.slug.trim()}` : null;
            const busy = selectingId === restaurant.id;

            return (
              <div
                key={restaurant.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <div className="p-5 flex items-center gap-4">
                  <div className="shrink-0 w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden">
                    {restaurant.logo_url ? (
                      <img
                        src={restaurant.logo_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <UtensilsCrossed className="h-6 w-6 text-gray-400" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-black text-gray-900 truncate">{restaurant.name}</h2>
                    {publicHref && (
                      <a
                        href={publicHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Menüyü gör
                        <ExternalLink size={12} aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <button
                    type="button"
                    disabled={busy || selectingId !== null}
                    onClick={() => handleSelect(restaurant.id)}
                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
                  >
                    {busy ? "Açılıyor…" : "Bu restoranı yönet"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => supabase.auth.signOut().then(() => router.push("/admin/login"))}
            className="inline-flex items-center gap-2 text-sm font-bold text-red-500 hover:text-red-600"
          >
            <LogOut size={16} aria-hidden />
            Çıkış yap
          </button>
          <Link href="/admin/login" className="text-xs text-gray-400 hover:text-gray-600">
            Farklı hesapla giriş
          </Link>
        </div>
      </div>
    </div>
  );
}
