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
