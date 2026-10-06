"use client";

import { useCallback, useEffect, useState } from "react";
import { appAlert } from "@/lib/app-notify";

/**
 * Pinned chats on the web, the same pins as the app (GET/POST /api/chat/pins):
 * a whole conversation kept at the top of the signed-in team member's or
 * admin's chat list, as WhatsApp's "Pin chat". Personal, up to 3.
 * Keys: "team:<thread id>" (team chat) or "room:<client room id>" (client chats).
 */
export function useChatPins() {
  const [pins, setPins] = useState<Map<string, string>>(() => new Map());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/pins", { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { pins?: { conversation: string; pinnedAt: string }[] };
      setPins(new Map((json.pins || []).map((pin) => [pin.conversation, pin.pinnedAt])));
    } catch {
      // keep the last known pins
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (key: string) => {
      const pinning = !pins.has(key);
      const before = pins;
      const next = new Map(pins);
      if (pinning) next.set(key, new Date().toISOString());
      else next.delete(key);
      setPins(next);
      try {
        const res = await fetch("/api/chat/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ conversation: key, pinned: pinning }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || (pinning ? "The chat could not be pinned." : "The chat could not be unpinned."));
        void load();
      } catch (error) {
        setPins(before);
        await appAlert(error instanceof Error ? error.message : "The chat could not be updated.");
      }
    },
    [pins, load],
  );

  const isPinned = useCallback((key: string) => pins.has(key), [pins]);

  /** Pinned first (most recently pinned on top), then the rest in their order. */
  const pinnedFirst = useCallback(
    <T,>(list: T[], keyOf: (item: T) => string) => {
      const pinned = list.filter((item) => pins.has(keyOf(item)));
      const rest = list.filter((item) => !pins.has(keyOf(item)));
      pinned.sort((a, b) => String(pins.get(keyOf(b))).localeCompare(String(pins.get(keyOf(a)))));
      return [...pinned, ...rest];
    },
    [pins],
  );

  return { isPinned, toggle, pinnedFirst };
}
