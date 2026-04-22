/**
 * Usernames that can never be assigned to a team member because
 * the root URL path collides with an existing static route, asset
 * folder, or reserved system name.
 *
 * Keep this list in sync with src/app/* top-level entries and any
 * new routes added at the project root.
 */
export const RESERVED_USERNAMES = new Set<string>([
  // App route groups and static pages
  "admin",
  "team",
  "auth",
  "login",
  "signup",
  "dashboard",
  "api",
  "about",
  "work",
  "works",
  "career",
  "careers",
  "careerform",
  "contact",
  "location",
  "banners",
  "consultation",
  "privacy",
  "terms",
  "partnership",
  "logofolio",
  "mobile-blocked",
  "access",
  "home",
  "contractor-onboard",
  "invoice",
  "links",
  "merch",
  "csign",
  "cdocs",
  "cmeet",
  "cresume",
  "protect-docs",
  "settings",
  "payroll",
  "chat",
  // System / asset folders
  "public",
  "static",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  // Defensive reservations
  "www",
  "mail",
  "support",
  "help",
  "docs",
  "blog",
  "pricing",
  "privacy-policy",
  "terms-of-service",
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(String(username || "").trim().toLowerCase());
}
