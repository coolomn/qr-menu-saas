"use client";

import ErrorScreen from "@/app/_components/ErrorScreen";

/**
 * Masadaki QR'ı okutan müşterinin göreceği hata ekranı.
 * Müşteri yabancı olabilir: metin TR + EN. Panel/ana sayfa linki yok.
 */
export default function MenuError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorScreen
      title="Menü şu an açılamadı · Menu could not be loaded"
      message="Lütfen birkaç saniye sonra tekrar deneyin. · Please try again in a few seconds."
      error={error}
      digest={error.digest}
      showDigest={false}
      actions={[
        { kind: "retry", label: "Tekrar dene · Try again", onClick: () => unstable_retry() },
      ]}
    />
  );
}
