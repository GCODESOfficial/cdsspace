/**
 * Sanitize a user-supplied search term before interpolating it into a
 * PostgREST `.or("col.ilike.%<term>%,...")` filter string.
 *
 * The `.or()` grammar is comma/parenthesis structured, so a raw term like
 * `a,role.eq.admin` or `x)` could inject extra filter conditions against
 * other columns. We strip the structural characters (comma, parens,
 * backslash, quotes) and the ILIKE wildcards, leaving a plain literal.
 */
export function sanitizeOrFilterTerm(input: unknown): string {
  return String(input ?? "")
    .replace(/[,()\\"'*%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
