"use client";

import "./globals.css";
import ErrorScreen from "@/app/_components/ErrorScreen";

/**
 * Kök layout dahil her şey çöktüğünde devreye girer; kendi <html>/<body>'sini kurar.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="tr">
      <body className="flex min-h-full flex-col antialiased">
        <title>Hata - TapMenu</title>
        <ErrorScreen
          title="Bir şeyler ters gitti · Something went wrong"
          message="Lütfen birkaç saniye sonra tekrar deneyin. · Please try again in a few seconds."
          error={error}
          digest={error.digest}
          actions={[
            { kind: "retry", label: "Tekrar dene · Try again", onClick: () => unstable_retry() },
          ]}
        />
      </body>
    </html>
  );
}
