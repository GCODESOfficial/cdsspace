import "server-only";

export const SECURE_FORM_UPLOAD_BUCKET = "secure-form-uploads";
export type SecureFormScope = "consultations" | "applications";

export function secureFormUploadUrl(scope: SecureFormScope, storagePath: string) {
  const token = Buffer.from(JSON.stringify({ scope, storagePath }), "utf8").toString("base64url");
  return `/api/admin/form-uploads/${token}`;
}

export function readSecureFormUploadToken(token: string) {
  if (!/^[a-zA-Z0-9_-]{10,1800}$/.test(token)) return null;
  try {
    const value = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Record<string, unknown>;
    const scope = value.scope;
    const storagePath = String(value.storagePath || "");
    if ((scope !== "consultations" && scope !== "applications")
      || !storagePath.startsWith(`${scope}/`)
      || storagePath.includes("..")
      || /[\u0000-\u001f\\]/.test(storagePath)) return null;
    return { scope, storagePath } as { scope: SecureFormScope; storagePath: string };
  } catch {
    return null;
  }
}
