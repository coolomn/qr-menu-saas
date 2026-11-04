"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

type Action =
  | { kind: "retry"; label: string; onClick: () => void }
  | { kind: "link"; label: string; href: string };

type Props = {
  title: string;
  message: string;
  actions: Action[];
  /** Sunucu loglarındaki hatayla eşleştirmek için Next.js'in verdiği kısa kod. */
  digest?: string;
  error?: Error;
  /** Ekranda "Hata kodu" satırı gösterilsin mi (müşteri menüsünde gizli). */
  showDigest?: boolean;
};

/**
 * Tüm hata/404 sayfalarının ortak görünümü.
 * Hata ayrıntısı (mesaj, stack) asla ekrana basılmaz; konsola yazılır ve Sentry'ye gönderilir.
 */
export default function ErrorScreen({
  title,
  message,
  actions,
  digest,
  error,
  showDigest = true,
}: Props) {
  useEffect(() => {
    if (!error) return;
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/tapmenu-mark.png"
          alt="TapMenu"
          width={48}
          height={48}
          className="mx-auto mb-5 h-12 w-12"
        />
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{message}</p>

        <div className="mt-6 flex flex-col gap-2">
          {actions.map((action, i) => {
            const cls =
              i === 0
                ? "inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white hover:bg-gray-800"
                : "inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50";
            return action.kind === "retry" ? (
              <button key={action.label} type="button" onClick={action.onClick} className={cls}>
                {action.label}
              </button>
            ) : (
              // Düz <a>: hata durumunda istemci yönlendiricisine güvenmeden tam sayfa yükleme.
              <a key={action.label} href={action.href} className={cls}>
                {action.label}
              </a>
            );
          })}
        </div>

        {showDigest && digest ? (
          <p className="mt-6 text-xs text-gray-400">Hata kodu: {digest}</p>
        ) : null}
      </div>
    </main>
  );
}
