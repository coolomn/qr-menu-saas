import type { OwnerCreationMode } from "@/lib/master-admin/create-payload";

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
  login_username: string;
  owner_creation_mode: OwnerCreationMode;
  owner_invited: boolean;
  owner_exists: boolean;
  created_owner: boolean;
  linked_existing_owner: boolean;
  login_url: string;
  invite_sent_at: string | null;
  message?: string;
  /** Yalnızca temporary_password modunda ve yalnızca bu yanıtta; tekrar gösterilmez. */
  temporary_password?: string;
};

export function buildOwnerLoginUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/admin/login`;
}
