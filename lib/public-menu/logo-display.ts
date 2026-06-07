export const LOGO_DISPLAY_MODES = ["auto", "light-card", "dark-card", "none"] as const;

export type LogoDisplayMode = (typeof LOGO_DISPLAY_MODES)[number];

export type ResolvedLogoDisplayMode = Exclude<LogoDisplayMode, "auto">;

export function normalizeLogoDisplayMode(raw: unknown): LogoDisplayMode {
  if (
    raw === "auto" ||
    raw === "light-card" ||
    raw === "dark-card" ||
    raw === "none"
  ) {
    return raw;
  }
  return "auto";
}

/** `auto` şimdilik açık kart gibi davranır. */
export function resolveLogoDisplayMode(mode: LogoDisplayMode): ResolvedLogoDisplayMode {
  if (mode === "auto") return "light-card";
  return mode;
}

export const LOGO_DISPLAY_MODE_LABELS: Record<LogoDisplayMode, string> = {
  auto: "Otomatik",
  "light-card": "Açık kart",
  "dark-card": "Koyu kart",
  none: "Kart yok",
};

export function getLogoCardClassName(resolved: ResolvedLogoDisplayMode): string {
  switch (resolved) {
    case "light-card":
      return "rounded-2xl bg-white/95 px-5 py-4 shadow-lg border border-white/70";
    case "dark-card":
      return "rounded-2xl bg-black/45 backdrop-blur-md px-5 py-4 shadow-lg border border-white/20";
    case "none":
      return "";
  }
}

export function getLogoImageClassName(variant: "hero" | "header"): string {
  const size =
    variant === "hero"
      ? "max-w-[min(260px,85vw)] max-h-24 sm:max-h-28"
      : "max-w-[min(220px,40vw)] max-h-10 sm:max-h-12";
  return `${size} w-auto h-auto object-contain`;
}
