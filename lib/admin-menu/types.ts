export type MenuCollectionCardVisualType = "icon" | "image" | "none";

export const MENU_COLLECTION_CARD_VISUAL_TYPES = ["icon", "image", "none"] as const;

export function normalizeMenuCollectionCardVisualType(
  value: unknown
): MenuCollectionCardVisualType {
  if (value === "image" || value === "none" || value === "icon") return value;
  return "icon";
}

export type AdminMenuCollection = {
  id: string;
  restaurant_id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  sort_order: number;
  card_visual_type: MenuCollectionCardVisualType;
  card_image_url: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AdminMenuCollectionListItem = Omit<AdminMenuCollection, "restaurant_id"> & {
  category_count: number;
};

export type MenuCollectionsListResponse = {
  items: AdminMenuCollectionListItem[];
};

export type MenuCollectionMutationResponse = {
  item: AdminMenuCollectionListItem;
};

export type CategoryMenuCollectionsPickerMenu = {
  id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  sort_order: number;
  is_active: boolean;
};

export type CategoryMenuCollectionsGetResponse = {
  menu_collections: CategoryMenuCollectionsPickerMenu[];
  menu_collection_ids: string[];
};

export type CategoryMenuCollectionsPutResponse = {
  menu_collection_ids: string[];
};

export type ProductMenuCollectionsGetResponse = {
  available_menu_collections: CategoryMenuCollectionsPickerMenu[];
  selected_menu_collection_ids: string[];
};

export type ProductMenuCollectionsPutResponse = {
  menu_collection_ids: string[];
};
