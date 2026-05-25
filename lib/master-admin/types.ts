export type MasterRestaurantListItem = {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  owner_email: string | null;
  created_at: string;
  tenant_status: string;
  subscription_ends_at: string | null;
  plan_type: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string | null;
  max_products: number | null;
  max_categories: number | null;
  max_imports: number | null;
  import_period: string | null;
  admin_notes: string | null;
};
