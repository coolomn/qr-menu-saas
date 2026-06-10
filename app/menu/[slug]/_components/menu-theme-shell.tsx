"use client";

import type { ReactNode } from "react";
import type { ResolvedMenuTheme } from "@/lib/public-menu/themes/resolve";

type MenuThemeShellProps = {
  theme: ResolvedMenuTheme;
  entered: boolean;
  children: ReactNode;
};

export function MenuThemeShell({ theme, entered, children }: MenuThemeShellProps) {
  return (
    <div
      data-theme={theme.appearance}
      data-font={theme.font}
      data-menu-theme={theme.appearance}
      style={
        {
          "--menu-accent": theme.brand,
          "--menu-price": theme.priceColor,
        } as React.CSSProperties
      }
      className={`${theme.classes.pageRoot} ${theme.classes.fontBody} ${
        entered ? theme.classes.pageEntered : theme.classes.pageEntering
      }`}
    >
      {children}
    </div>
  );
}
