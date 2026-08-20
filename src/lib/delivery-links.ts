const DELIVERY_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDeliveryPublicToken(value: string) {
  return DELIVERY_TOKEN_PATTERN.test(value);
}

function deliveryTitleSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "completed-work";
}

/** Keep the title readable while retaining the opaque UUID as access control. */
export function publicDeliveryReference(title: string, token: string) {
  return `${deliveryTitleSlug(title)}--${token}`;
}

export function publicDeliveryPath(title: string, token: string) {
  return `/delivery/${publicDeliveryReference(title, token)}`;
}

export function deliveryTokenFromReference(value: string) {
  if (isDeliveryPublicToken(value)) return value.toLowerCase();
  const match = value.match(/--([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match?.[1]?.toLowerCase() || null;
}
