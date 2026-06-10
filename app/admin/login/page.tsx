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

const LOGIN_ERROR_MESSAGE = "E-posta/kullanıcı adı veya şifre hatalı.";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const showForm = () => {
      if (!cancelled) setCheckingInvite(false);
    };

    const fallback = window.setTimeout(showForm, 2000);

    const search = window.location.search;
    const hash = window.location.hash;

    if (shouldRedirectLoginToSetPassword(search, hash)) {
      router.replace(setPasswordUrlPreservingAuthParams());
    } else {
      showForm();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // Sayfanın yenilenmesini engeller
    setError("");
    setLoading(true);

    const trimmedIdentifier = identifier.trim();
    let loginEmail = trimmedIdentifier;

    if (!trimmedIdentifier.includes("@")) {
      try {
        const resolveRes = await fetch("/api/admin/auth/resolve-login-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmedIdentifier }),
        });
        if (!resolveRes.ok) {
          setError(LOGIN_ERROR_MESSAGE);
          setLoading(false);
          return;
        }
        const resolveJson = (await resolveRes.json()) as { email?: string };
        if (!resolveJson.email) {
          setError(LOGIN_ERROR_MESSAGE);
          setLoading(false);
          return;
        }
        loginEmail = resolveJson.email;
      } catch {
        setError(LOGIN_ERROR_MESSAGE);
        setLoading(false);
        return;
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error) {
      setError(LOGIN_ERROR_MESSAGE);
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              E-posta veya kullanıcı adı
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900"
              placeholder="ornek@email.com veya kullanici-adi"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
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