"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  getMenuFontShellClassName,
  getMenuFontStylesheetHref,
} from "@/lib/public-menu/themes/menu-font-css";

const loadedStylesheets = new Set<string>();
const pendingStylesheets = new Map<string, Promise<void>>();

function ensureMenuFontStylesheet(href: string): Promise<void> {
  if (loadedStylesheets.has(href)) return Promise.resolve();
  const pending = pendingStylesheets.get(href);
  if (pending) return pending;

  const loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLLinkElement>(
      `link[data-menu-font-stylesheet="${href}"]`
    );
    if (existing) {
      loadedStylesheets.add(href);
      resolve();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.menuFontStylesheet = href;
    link.onload = () => {
      loadedStylesheets.add(href);
      resolve();
    };
    link.onerror = () => {
      reject(new Error(`Menü font dosyası yüklenemedi: ${href}`));
    };
    document.head.appendChild(link);
  }).finally(() => {
    pendingStylesheets.delete(href);
  });

  pendingStylesheets.set(href, loadPromise);
  return loadPromise;
}

/** Start loading the stylesheet as soon as bootstrap exposes font_style_id. */
export function prefetchMenuFontShell(fontStyleId: unknown): void {
  const href = getMenuFontStylesheetHref(fontStyleId);
  if (href) void ensureMenuFontStylesheet(href);
}

export function MenuFontLoader({
  fontStyleId,
  children,
}: {
  fontStyleId: unknown;
  children: ReactNode;
}) {
  const href = getMenuFontStylesheetHref(fontStyleId);
  const shellClassName = getMenuFontShellClassName(fontStyleId);
  const [fontReady, setFontReady] = useState(!href);

  useEffect(() => {
    if (!href) {
      setFontReady(true);
      return;
    }

    let cancelled = false;
    setFontReady(false);
    void ensureMenuFontStylesheet(href)
      .then(() => {
        if (!cancelled) setFontReady(true);
      })
      .catch(() => {
        if (!cancelled) setFontReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [href]);

  return (
    <div className={shellClassName || undefined} data-menu-font-ready={fontReady}>
      {children}
    </div>
  );
}
