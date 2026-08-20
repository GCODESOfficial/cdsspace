import "server-only";

import {
  buildPostText,
  SocialError,
  type PublishResult,
  type SocialConnection,
  type SocialContent,
  type SocialProvider,
  type StoredConnectionInput,
} from "@/lib/social/types";

// Scopes: openid/profile identify the connecting admin; w_member_social is the
// personal-share fallback; r_organization_admin + w_organization_social let us
// post AS the CDS Space company page (needs the "Community Management API"
// product on the LinkedIn app). Override the whole set with LINKEDIN_SCOPES.
const DEFAULT_SCOPES = ["openid", "profile", "w_member_social", "r_organization_admin", "w_organization_social"];
const SCOPES = process.env.LINKEDIN_SCOPES?.trim()
  ? process.env.LINKEDIN_SCOPES.trim().split(/[\s,]+/).filter(Boolean)
  : DEFAULT_SCOPES;

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const ORG_ACLS_URL = "https://api.linkedin.com/v2/organizationAcls";
const REGISTER_UPLOAD_URL = "https://api.linkedin.com/v2/assets?action=registerUpload";
// Classic UGC share endpoint - no versioned header (that 426s once stale).
const UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";

function creds() {
  return {
    clientId: process.env.LINKEDIN_CLIENT_ID?.trim() || "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET?.trim() || "",
  };
}

/**
 * Find the organization (company page) the connecting user administers, so we
 * post as the brand page rather than their personal profile. Prefers
 * LINKEDIN_ORG_ID when set; otherwise asks LinkedIn for pages the user is an
 * approved ADMINISTRATOR of. Returns null if org scopes weren't granted (then
 * we fall back to personal posting).
 */
async function resolveOrganization(accessToken: string): Promise<{ urn: string; name: string } | null> {
  const envId = process.env.LINKEDIN_ORG_ID?.trim();
  if (envId) {
    return { urn: `urn:li:organization:${envId}`, name: process.env.LINKEDIN_ORG_NAME?.trim() || "CDS Space" };
  }
  try {
    const url = `${ORG_ACLS_URL}?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&projection=(elements*(organizationalTarget~(localizedName)))`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const element = Array.isArray(data.elements) ? data.elements[0] : null;
    const urn: string | undefined = element?.organizationalTarget;
    if (!urn) return null;
    const name = element?.["organizationalTarget~"]?.localizedName || "Company page";
    return { urn, name };
  } catch {
    return null;
  }
}

/**
 * Register + upload an image to LinkedIn and return its asset URN. LinkedIn only
 * accepts raster images, so SVG (our WOTD cards) is rasterized to PNG via sharp.
 * The upload owner must match the post author (person or organization).
 */
async function uploadImageAsset(accessToken: string, ownerUrn: string, imageUrl: string): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new SocialError("Could not fetch the post image for LinkedIn.", 502);
  let buffer: Buffer = Buffer.from(new Uint8Array(await imgRes.arrayBuffer()));
  let contentType = imgRes.headers.get("content-type") || "";

  if (contentType.includes("svg") || /\.svg(\?|$)/i.test(imageUrl)) {
    const sharp = (await import("sharp")).default;
    // Fixed width keeps the card crisp on LinkedIn without shipping a huge file.
    buffer = await sharp(buffer, { density: 200 }).resize(1200, 1200, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    contentType = "image/png";
  }

  const registerRes = await fetch(REGISTER_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: ownerUrn,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }),
  });
  const registered = await registerRes.json().catch(() => ({}));
  if (!registerRes.ok || !registered?.value?.asset) {
    throw new SocialError(`LinkedIn image registration failed (${registerRes.status}): ${JSON.stringify(registered).slice(0, 200)}`, 502);
  }
  const asset: string = registered.value.asset;
  const uploadUrl: string | undefined =
    registered.value.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  if (!uploadUrl) throw new SocialError("LinkedIn did not return an image upload URL.", 502);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType || "image/png" },
    body: buffer,
  });
  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => "");
    throw new SocialError(`LinkedIn image upload failed (${uploadRes.status}): ${detail.slice(0, 200)}`, 502);
  }
  return asset;
}

export const linkedInProvider: SocialProvider = {
  platform: "linkedin",
  label: "LinkedIn",

  isConfigured() {
    const { clientId, clientSecret } = creds();
    return Boolean(clientId && clientSecret);
  },

  getAuthUrl({ redirectUri, state }) {
    const { clientId } = creds();
    if (!clientId) throw new SocialError("LINKEDIN_CLIENT_ID is not set.", 500);
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", SCOPES.join(" "));
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }): Promise<StoredConnectionInput> {
    const { clientId, clientSecret } = creds();
    if (!clientId || !clientSecret) {
      throw new SocialError("LinkedIn is missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET.", 500);
    }
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const token = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !token.access_token) {
      throw new SocialError(token.error_description || token.error || "LinkedIn token exchange failed.", 502);
    }

    // Identify the connecting user (fallback author + audit).
    const meRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !me.sub) {
      throw new SocialError("Could not read the LinkedIn profile after connecting.", 502);
    }
    const personUrn = `urn:li:person:${me.sub}`;

    // Prefer posting as the company page the user administers.
    const org = await resolveOrganization(token.access_token);

    const expiresAt = token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null;

    return {
      accountName: org ? org.name : (me.name || me.email || "LinkedIn account"),
      accountUrn: org ? org.urn : personUrn,
      scope: token.scope || SCOPES.join(" "),
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      tokenExpiresAt: expiresAt,
      metadata: {
        author_type: org ? "organization" : "person",
        person_urn: personUrn,
        person_name: me.name || null,
        org_urn: org?.urn || null,
        picture: me.picture || null,
      },
    };
  },

  async publish(connection: SocialConnection, content: SocialContent): Promise<PublishResult> {
    const author = connection.accountUrn;
    if (!author) throw new SocialError("The LinkedIn connection is missing its author id. Reconnect the account.");
    // Company-page only: never post to a personal profile. If the connection
    // resolved to a person, tell the admin to reconnect as the CDS Space page.
    if (author.startsWith("urn:li:person:") && process.env.LINKEDIN_ALLOW_PERSONAL !== "true") {
      throw new SocialError("LinkedIn is connected as a personal profile. Add the Community Management API product to the LinkedIn app, then reconnect so posts publish as the CDS Space company page.", 409);
    }
    const text = buildPostText(content);

    // Upload the item's image (rasterizing SVG) so the post carries the visual.
    let assetUrn: string | null = null;
    if (content.imageUrl) {
      assetUrn = await uploadImageAsset(connection.accessToken, author, content.imageUrl);
    }

    const shareContent: Record<string, unknown> = {
      shareCommentary: { text },
      shareMediaCategory: assetUrn ? "IMAGE" : "NONE",
    };
    if (assetUrn) {
      shareContent.media = [{ status: "READY", media: assetUrn, title: { text: (content.title || "").slice(0, 200) } }];
    }

    const res = await fetch(UGC_POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 401) throw new SocialError("LinkedIn rejected the token (expired or revoked). Reconnect the account.", 401);
      if (res.status === 403) throw new SocialError("LinkedIn refused to post as this account. For company-page posting, add the Community Management API product and reconnect.", 403);
      throw new SocialError(`LinkedIn publish failed (${res.status}): ${detail.slice(0, 300)}`, 502);
    }

    let postId = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id");
    if (!postId) {
      const data = await res.json().catch(() => ({}));
      postId = data.id || null;
    }
    return {
      externalPostId: postId,
      externalUrl: postId ? `https://www.linkedin.com/feed/update/${postId}` : null,
    };
  },
};
