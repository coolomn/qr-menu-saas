"use client";

import {
  getLogoCardClassName,
  getLogoImageClassName,
  normalizeLogoDisplayMode,
  resolveLogoDisplayMode,
  type LogoDisplayMode,
} from "@/lib/public-menu/logo-display";

type PublicRestaurantLogoProps = {
  logoUrl: string | null;
  restaurantName: string;
  logoDisplayMode?: LogoDisplayMode | string | null;
  variant?: "hero" | "header";
  nameClassName?: string;
  nameStyle?: React.CSSProperties;
  className?: string;
};

export function PublicRestaurantLogo({
  logoUrl,
  restaurantName,
  logoDisplayMode,
  variant = "hero",
  nameClassName = "",
  nameStyle,
  className = "",
}: PublicRestaurantLogoProps) {
  const resolved = resolveLogoDisplayMode(normalizeLogoDisplayMode(logoDisplayMode));
  const cardClass = getLogoCardClassName(resolved);
  const imageClass = getLogoImageClassName(variant);

  if (!logoUrl) {
    const fallbackNameClass =
      variant === "hero"
        ? "text-2xl sm:text-3xl font-black tracking-widest text-center"
        : "text-base sm:text-xl font-black tracking-tighter uppercase truncate text-center max-w-[42vw] sm:max-w-md";

    if (resolved === "none" || !cardClass) {
      return (
        <h1
          className={`${fallbackNameClass} ${nameClassName} ${className}`.trim()}
          style={nameStyle}
        >
          {restaurantName}
        </h1>
      );
    }

    return (
      <div className={`inline-flex items-center justify-center ${cardClass} ${className}`.trim()}>
        <h1 className={`${fallbackNameClass} ${nameClassName}`.trim()} style={nameStyle}>
          {restaurantName}
        </h1>
      </div>
    );
  }

  const image = (
    <img
      src={logoUrl}
      alt="Restoran Logosu"
      className={imageClass}
      draggable={false}
    />
  );

  if (resolved === "none") {
    return <div className={`inline-flex items-center justify-center ${className}`.trim()}>{image}</div>;
  }

  return (
    <div className={`inline-flex items-center justify-center ${cardClass} ${className}`.trim()}>
      {image}
    </div>
  );
}
