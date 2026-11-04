"use client";

import ErrorScreen from "@/app/_components/ErrorScreen";

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorScreen
      title="Panelde bir hata oluştu"
      message="Bu ekran yüklenirken beklenmeyen bir hata oluştu. Kaydedilmiş verileriniz etkilenmez. Tekrar deneyin; sorun sürerse aşağıdaki hata kodunu bize iletin."
      error={error}
      digest={error.digest}
      actions={[
        { kind: "retry", label: "Tekrar dene", onClick: () => unstable_retry() },
        { kind: "link", label: "Panele dön", href: "/admin" },
        { kind: "link", label: "Giriş sayfası", href: "/admin/login" },
      ]}
    />
  );
}
