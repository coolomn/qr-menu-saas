"use client";

import ErrorScreen from "@/app/_components/ErrorScreen";

export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorScreen
      title="Bir şeyler ters gitti"
      message="Sayfa yüklenirken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin."
      error={error}
      digest={error.digest}
      actions={[
        { kind: "retry", label: "Tekrar dene", onClick: () => unstable_retry() },
        { kind: "link", label: "Ana sayfaya dön", href: "/" },
      ]}
    />
  );
}
