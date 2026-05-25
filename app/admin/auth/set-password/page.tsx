"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import {
  getSafeAdminNextFromLocation,
  resolveInviteSession,
} from "@/lib/admin-auth/invite-flow";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const supabase = getBrowserSupabase();

const MIN_PASSWORD_LENGTH = 8;

type Phase = "loading" | "form" | "submitting" | "success" | "error";

export default function SetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { session, errorMessage: resolveError } = await resolveInviteSession();
      if (cancelled) return;

      if (resolveError || !session) {
        setErrorMessage(
          resolveError ??
            "Davet bağlantısı geçersiz veya süresi dolmuş olabilir. Yöneticinizden yeni davet isteyin."
        );
        setPhase("error");
        return;
      }

      setPhase("form");
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== "form") return;

    setFormError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Şifreler eşleşmiyor. Lütfen tekrar deneyin.");
      return;
    }

    setPhase("submitting");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setPhase("form");
      setFormError(
        error.message.includes("same")
          ? "Yeni şifre öncekinden farklı olmalıdır."
          : "Şifre kaydedilemedi. Bağlantınızın geçerli olduğundan emin olun veya yeni davet isteyin."
      );
      return;
    }

    setPhase("success");
    const destination = getSafeAdminNextFromLocation();
    window.setTimeout(() => {
      router.replace(destination);
    }, 1200);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-gray-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-600 mb-4">
            <Lock size={24} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Şifrenizi oluşturun</h1>
          <p className="text-gray-500 mt-2 text-sm leading-relaxed">
            TapMenu davetiniz onaylandı. Devam etmek için güçlü bir şifre belirleyin; ardından
            yönetim paneline yönlendirileceksiniz.
          </p>
        </div>

        {phase === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
            <Loader2 size={28} className="animate-spin text-blue-600" />
            <p className="text-sm font-medium">Davet bağlantınız doğrulanıyor…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {errorMessage}
            </div>
            <Link
              href="/admin/login"
              className="block w-full text-center py-2.5 rounded-lg border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50"
            >
              Giriş sayfasına dön
            </Link>
          </div>
        )}

        {phase === "success" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={40} className="text-green-600" />
            <p className="text-sm font-semibold text-gray-900">Şifreniz kaydedildi</p>
            <p className="text-sm text-gray-500">Yönetim paneline yönlendiriliyorsunuz…</p>
            <Loader2 size={20} className="animate-spin text-blue-600" />
          </div>
        )}

        {(phase === "form" || phase === "submitting") && (
          <>
            {formError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100">
                {formError}
              </div>
            )}
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Yeni şifre</label>
                <input
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  disabled={phase === "submitting"}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 disabled:bg-gray-50"
                  placeholder="En az 8 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Şifre tekrar</label>
                <input
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  disabled={phase === "submitting"}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 disabled:bg-gray-50"
                  placeholder="Şifrenizi tekrar girin"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={phase === "submitting"}
                className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {phase === "submitting" && <Loader2 size={18} className="animate-spin" />}
                {phase === "submitting" ? "Kaydediliyor…" : "Şifreyi kaydet ve panele git"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
