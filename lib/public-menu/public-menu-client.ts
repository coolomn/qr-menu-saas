import {
  publicMenuApiPath,
  publicMenuBootstrapApiPath,
} from "@/lib/public-menu/cache-headers";
import type { PublicMenuBootstrapPayload, PublicMenuContentPayload } from "@/lib/public-menu/load-public-menu";
import type { PublicMenuCollection, PublicMenuPicker } from "@/lib/public-menu/menu-collections";

/** Default fetch: browser honors max-age=0 on responses; CDN caches via s-maxage. */
export const PUBLIC_MENU_FETCH_OPTIONS: RequestInit = {};

export type PublicMenuBootstrapResponse = PublicMenuBootstrapPayload;

export type PublicMenuContentResponse = PublicMenuContentPayload;

export type PublicMenuFullResponse = PublicMenuBootstrapPayload & PublicMenuContentPayload;

export async function getPublicMenuBootstrap(slug: string): Promise<{
  status: number;
  data?: PublicMenuBootstrapResponse;
  error?: string;
}> {
  const response = await fetch(publicMenuBootstrapApiPath(slug), PUBLIC_MENU_FETCH_OPTIONS);

  if (response.status === 403) {
    return { status: 403, error: "unavailable" };
  }

  if (!response.ok) {
    return { status: response.status, error: "bootstrap_failed" };
  }

  const data = (await response.json()) as PublicMenuBootstrapResponse;
  return { status: 200, data };
}

export async function getPublicMenuContent(slug: string): Promise<{
  status: number;
  data?: PublicMenuContentResponse;
  error?: string;
}> {
  const response = await fetch(publicMenuApiPath(slug), PUBLIC_MENU_FETCH_OPTIONS);

  if (response.status === 403) {
    return { status: 403, error: "unavailable" };
  }

  if (!response.ok) {
    return { status: response.status, error: "content_failed" };
  }

  const data = (await response.json()) as PublicMenuFullResponse;
  return {
    status: 200,
    data: {
      categories: data.categories ?? [],
      products: data.products ?? [],
    },
  };
}

export function shouldPrefetchPublicMenuContent(args: {
  useCollectionFlow: boolean;
  menuPicker: PublicMenuPicker | null;
}): boolean {
  const picker = args.menuPicker ?? { enabled: false, default_menu_collection_id: null };
  if (!args.useCollectionFlow) return true;
  return !picker.enabled;
}

export function canRenderMenuView(menuDataLoaded: boolean): boolean {
  return menuDataLoaded;
}

export function shouldSkipContentFetch(args: {
  menuDataLoaded: boolean;
  menuDataLoading: boolean;
}): boolean {
  return args.menuDataLoaded || args.menuDataLoading;
}

export type MenuNavigationIntent =
  | { kind: "menu"; menuCollectionId?: string | null; mainGroup?: string | null; categoryId?: string | null }
  | null;

export function applyMenuNavigationIntent(
  intent: MenuNavigationIntent,
  handlers: {
    setSelectedMenuCollectionId: (id: string | null) => void;
    setMenuMainGroup: (group: string | null) => void;
    setActiveCategory: (id: string | null) => void;
    setView: (view: "welcome" | "menu") => void;
  }
): void {
  if (!intent || intent.kind !== "menu") return;
  if (intent.menuCollectionId !== undefined) {
    handlers.setSelectedMenuCollectionId(intent.menuCollectionId);
  }
  if (intent.mainGroup !== undefined) {
    handlers.setMenuMainGroup(intent.mainGroup);
  }
  if (intent.categoryId) {
    handlers.setActiveCategory(intent.categoryId);
  }
  handlers.setView("menu");
}

export function menuPickerFromBootstrap(
  menuPicker: PublicMenuPicker | undefined
): PublicMenuPicker {
  return menuPicker ?? { enabled: false, default_menu_collection_id: null };
}

export function menuCollectionsFromBootstrap(
  menuCollections: PublicMenuCollection[] | undefined
): PublicMenuCollection[] {
  return menuCollections ?? [];
}
