export type MasterCreateRestaurantResponse = {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    owner_id: string | null;
    tenant_status: string;
    subscription_ends_at: string | null;
    created_at: string;
  };
  owner_email: string;
  owner_invited: boolean;
  owner_exists: boolean;
  login_url: string;
  invite_sent_at: string | null;
};

export function buildOwnerLoginUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/admin/login`;
}
