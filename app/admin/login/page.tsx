"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isSafeAdminNextPath,
  setPasswordUrlPreservingAuthParams,
  shouldRedirectLoginToSetPassword,
} from "@/lib/admin-auth/invite-flow";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { resolvePostLoginPath } from "@/lib/master-admin/client-auth";

const supabase = getBrowserSupabase();

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldRedirectLoginToSetPassword(window.location.search, window.location.hash)) {
      router.replace(setPasswordUrlPreservingAuthParams());
      return;
    }
    setCheckingInvite(false);
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // Sayfanın yenilenmesini engeller
    setError("");
    setLoading(true);

    // Supabase ile giriş yapmayı deniyoruz
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Giriş başarısız: E-posta veya şifre hatalı.");
      setLoading(false);
      return;
    }

    const session = data.session;
    if (!session?.access_token) {
      setError("Oturum oluşturulamadı. Tekrar deneyin.");
      setLoading(false);
      return;
    }

    const nextParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null;
    if (isSafeAdminNextPath(nextParam)) {
      router.push(nextParam);
      return;
    }

    const destination = await resolvePostLoginPath(session.access_token);
    router.push(destination);
  };

  if (checkingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 text-gray-500 text-sm font-medium">
        Yönlendiriliyor…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
        
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Yönetim Paneli</h1>
          <p className="text-gray-500 mt-2 text-sm">Menünüzü yönetmek için giriş yapın</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-posta Adresi</label>
            <input
              type="email"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900"
              placeholder="ornek@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400"
          >
            {loading ? "Giriş Yapılıyor..." : "Giriş Yap"}
          </button>
        </form>

      </div>
    </div>
  );
}   