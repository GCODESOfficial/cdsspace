import { cookies } from "next/headers";

export interface AdminSession {
  role: "super_admin" | "sub_admin";
  email: string;
  name: string;
  permissions: string[];
}

/** Server-only: read the admin session from the httpOnly cookie. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const raw = store.get("admin_session")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminSession;
    if (parsed.role !== "super_admin" && parsed.role !== "sub_admin") return null;
    return parsed;
  } catch {
    return null;
  }
}
