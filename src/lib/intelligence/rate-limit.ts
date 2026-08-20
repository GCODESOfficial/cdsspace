import "server-only";

type Entry = { count: number; resetAt: number };
const windows = new Map<string, Entry>();

export function checkIntelligenceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    windows.set(key, next);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: next.resetAt };
  }
  current.count += 1;
  if (windows.size > 5000) {
    for (const [entryKey, entry] of windows) if (entry.resetAt <= now) windows.delete(entryKey);
  }
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}
