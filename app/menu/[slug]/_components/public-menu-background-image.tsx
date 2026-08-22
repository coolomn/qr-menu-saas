"use client";

import { useState } from "react";
import { resolveWelcomeBackgroundSrc } from "@/lib/public-menu/welcome-background";

type PublicMenuBackgroundImageProps = {
  src: string | null | undefined;
  /** LCP welcome hero — eager load + high fetch priority. */
  priority?: boolean;
  className?: string;
};

const DEFAULT_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center";

export function PublicMenuBackgroundImage({
  src,
  priority = true,
  className = DEFAULT_IMAGE_CLASS,
}: PublicMenuBackgroundImageProps) {
  const [hidden, setHidden] = useState(false);
  const resolvedSrc = resolveWelcomeBackgroundSrc(src);

  if (hidden) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt=""
      aria-hidden
      className={className}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      onError={() => setHidden(true)}
    />
  );
}
