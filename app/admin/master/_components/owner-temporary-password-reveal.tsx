"use client";

import { AlertTriangle, KeyRound } from "lucide-react";
import { CopyButton } from "./copy-button";

type OwnerTemporaryPasswordRevealProps = {
  ownerEmail: string;
  temporaryPassword: string;
  loginUrl: string;
  onDismiss?: () => void;
};

export function OwnerTemporaryPasswordReveal({
  ownerEmail,
  temporaryPassword,
  loginUrl,
  onDismiss,
}: OwnerTemporaryPasswordRevealProps) {
  const credentialsBlock = `TapMenu giriş bilgileri\nE-posta: ${ownerEmail}\nGeçici şifre: ${temporaryPassword}\nGiriş: ${loginUrl}\n\nBu şifre yalnızca bir kez gösterilir.`;

  return (
    <section className="bg-white border-2 border-amber-200 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-800 font-black text-xs uppercase tracking-wider">
          <KeyRound size={14} />
          Geçici giriş bilgileri
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-bold text-gray-500 hover:text-gray-800"
          >
            Kapat
          </button>
        )}
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex gap-2">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <p>
          <span className="font-bold">Bu şifre yalnızca bir kez gösterilir.</span> Sayfadan
          ayrıldıktan sonra tekrar görüntülenemez.
        </p>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-bold text-gray-500 uppercase">E-posta</dt>
          <dd className="font-mono text-gray-900 mt-0.5 break-all">{ownerEmail}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-gray-500 uppercase">Geçici şifre</dt>
          <dd className="font-mono text-lg font-bold text-gray-900 mt-0.5 tracking-wide break-all">
            {temporaryPassword}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-gray-500 uppercase">Panel giriş adresi</dt>
          <dd className="font-mono text-gray-900 mt-0.5 break-all">{loginUrl}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={credentialsBlock} label="Giriş bilgilerini kopyala" variant="primary" />
        <CopyButton text={loginUrl} label="Yalnızca giriş adresi" />
      </div>
    </section>
  );
}
