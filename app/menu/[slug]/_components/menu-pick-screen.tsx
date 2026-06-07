"use client";

import {
  getAllDayLabel,
  getMenuCollectionEmoji,
  getMenuCollectionSubtitle,
  getMenuCollectionTitle,
  getMenuPickSubtitle,
} from "@/lib/public-menu/display";
import type { PublicMenuCollection } from "@/lib/public-menu/menu-collections";
import type { LogoDisplayMode } from "@/lib/public-menu/logo-display";
import { PublicRestaurantLogo } from "@/app/menu/[slug]/_components/public-restaurant-logo";

type InstagramContext = {
  webUrl: string;
  appUsername: string | null;
} | null;

type MenuPickScreenProps = {
  restaurantName: string;
  logoUrl: string | null;
  logoDisplayMode?: LogoDisplayMode | null;
  welcomeBgUrl: string | null;
  language: string;
  onLanguageChange: (lang: string) => void;
  menuCollections: PublicMenuCollection[];
  onSelectCollection: (menuCollectionId: string) => void;
  instagramCtx: InstagramContext;
  onInstagramClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  instagramLabel: string;
};

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8A3.6 3.6 0 0 0 20 16.4V7.6A3.6 3.6 0 0 0 16.4 4H7.6m9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 .001 6.001A3 3 0 0 0 12 9z" />
    </svg>
  );
}

export function MenuPickScreen({
  restaurantName,
  logoUrl,
  logoDisplayMode,
  welcomeBgUrl,
  language,
  onLanguageChange,
  menuCollections,
  onSelectCollection,
  instagramCtx,
  onInstagramClick,
  instagramLabel,
}: MenuPickScreenProps) {
  const bg =
    welcomeBgUrl ||
    "https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1934&auto=format&fit=crop";

  return (
    <div
      className="relative min-h-[100dvh] flex flex-col font-sans animate-in fade-in duration-500"
      style={{ backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/55 pointer-events-none" />

      <div className="relative z-10 w-full p-5 sm:p-6 flex justify-end">
        <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-black text-gray-900 shadow-lg flex gap-3 border border-white/40">
          {(["tr", "en", "ru"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => onLanguageChange(lang)}
              className={`uppercase transition-opacity ${
                language === lang ? "text-gray-900 opacity-100" : "opacity-35"
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center px-6 pt-2 pb-4">
        <PublicRestaurantLogo
          logoUrl={logoUrl}
          restaurantName={restaurantName}
          logoDisplayMode={logoDisplayMode}
          variant="hero"
          nameClassName="text-white"
        />
        <p className="mt-5 text-sm sm:text-base font-semibold tracking-[0.2em] uppercase text-white/90 text-center drop-shadow-sm">
          {getMenuPickSubtitle(language)}
        </p>
      </div>

      <div className="relative z-10 flex-1 w-full max-w-md mx-auto px-5 sm:px-6 pb-8 flex flex-col justify-center gap-3 sm:gap-4">
        {menuCollections.map((collection, index) => {
          const title = getMenuCollectionTitle(collection, language);
          const subtitle = getMenuCollectionSubtitle(collection, language);
          return (
            <button
              key={collection.id}
              type="button"
              onClick={() => onSelectCollection(collection.id)}
              className="group w-full text-left rounded-2xl border border-white/30 bg-white/12 backdrop-blur-xl px-5 py-5 sm:py-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)] transition-all duration-300 hover:bg-white/20 hover:border-white/45 hover:shadow-[0_12px_40px_rgba(0,0,0,0.22)] active:scale-[0.98] animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
              style={{ animationDelay: `${120 + index * 80}ms`, animationDuration: "500ms" }}
            >
              <div className="flex items-center gap-4">
                <span
                  className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-white/15 text-2xl sm:text-3xl shrink-0 transition-transform duration-300 group-hover:scale-105"
                  aria-hidden
                >
                  {getMenuCollectionEmoji(collection)}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-lg sm:text-xl font-black text-white tracking-tight leading-tight">
                    {title}
                  </span>
                  {subtitle ? (
                    <span className="block mt-1 text-sm font-medium text-white/75 tabular-nums">
                      {subtitle}
                    </span>
                  ) : (
                    <span className="block mt-1 text-sm font-medium text-white/60">
                      {getAllDayLabel(language)}
                    </span>
                  )}
                </div>
                <span
                  className="text-white/50 text-xl font-light shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white/80"
                  aria-hidden
                >
                  →
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {instagramCtx && (
        <footer className="relative z-10 px-6 pb-10 pt-2 max-w-md mx-auto w-full">
          <a
            href={instagramCtx.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onInstagramClick}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/35 bg-white/10 px-4 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-lg backdrop-blur-md transition hover:bg-white/20 active:scale-[0.99]"
          >
            <InstagramGlyph className="h-5 w-5 shrink-0" />
            {instagramLabel}
          </a>
        </footer>
      )}
    </div>
  );
}
