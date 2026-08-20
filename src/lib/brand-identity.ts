export const BRAND_IDENTITY_BUCKET = "brand-identity-deliveries";

export type BrandIdentityFileKind = "image" | "pdf" | "office" | "archive" | "document";

export interface BrandIdentityFile {
  id: string;
  delivery_id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  file_kind: BrandIdentityFileKind;
  position: number;
  created_at: string;
  download_url: string | null;
}

export interface BrandIdentityDelivery {
  id: string;
  user_id?: string;
  project_id: string;
  brief_id?: string | null;
  title: string;
  description: string | null;
  public_token: string;
  is_public: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  project_name?: string | null;
  client_name?: string | null;
  files: BrandIdentityFile[];
  public_url?: string | null;
}

export function brandIdentityPublicPath(token: string) {
  return `/brand-identity/${encodeURIComponent(token)}`;
}
