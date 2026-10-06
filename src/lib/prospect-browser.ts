import "server-only";

import { assertPublicHttpUrl } from "@/lib/sales-growth-research";

/**
 * Renders directory pages in a real Chrome so listings that are assembled in the
 * browser can be read the way a person reading the page would see them.
 *
 * It speaks the Chrome DevTools Protocol over the WebSocket that is built into
 * Node, so nothing is added to the dependency tree and no browser is bundled.
 * Point it at a Chrome you already have:
 *
 *   Chrome, on this machine:
 *     open -a "Google Chrome" --args --remote-debugging-port=9222
 *     BROWSER_CDP_URL=http://127.0.0.1:9222
 *
 *   A hosted browser (browserless and similar):
 *     BROWSER_WS_ENDPOINT=wss://chrome.example.com?token=...
 */

const HUMAN_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface RenderedPage {
  url: string;
  title: string;
  html: string;
  scrolls: number;
}

export function browserConfigured() {
  return Boolean(process.env.BROWSER_WS_ENDPOINT || process.env.BROWSER_CDP_URL);
}

export function browserSetupHint() {
  return "No browser is connected. Start Chrome with --remote-debugging-port=9222 and set BROWSER_CDP_URL=http://127.0.0.1:9222, or set BROWSER_WS_ENDPOINT to a hosted browser.";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Small randomised pause so a paged crawl does not read as a machine gun. */
function humanPause(base: number) {
  return delay(base + Math.floor(Math.random() * base * 0.6));
}

async function resolveEndpoint() {
  const direct = (process.env.BROWSER_WS_ENDPOINT || "").trim();
  if (direct) return direct;
  const cdpUrl = (process.env.BROWSER_CDP_URL || "").trim().replace(/\/$/, "");
  if (!cdpUrl) throw new Error(browserSetupHint());
  const response = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`The browser at ${cdpUrl} did not respond. ${browserSetupHint()}`);
  const info = await response.json().catch(() => ({}));
  const endpoint = info?.webSocketDebuggerUrl;
  if (!endpoint) throw new Error(`The browser at ${cdpUrl} exposed no debugging socket. ${browserSetupHint()}`);
  return endpoint as string;
}

type Listener = (method: string, params: any, sessionId?: string) => void;

/** Minimal promise-based DevTools Protocol client over the native WebSocket. */
class DevToolsSession {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
  private listeners = new Set<Listener>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      let message: any;
      try {
        message = JSON.parse(String((event as MessageEvent).data));
      } catch {
        return;
      }
      if (message.id && this.pending.has(message.id)) {
        const entry = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message || "DevTools command failed."));
        else entry.resolve(message.result);
        return;
      }
      if (message.method) for (const listener of this.listeners) listener(message.method, message.params, message.sessionId);
    });
    socket.addEventListener("close", () => {
      for (const entry of this.pending.values()) entry.reject(new Error("The browser connection closed."));
      this.pending.clear();
    });
  }

  static async open(endpoint: string, timeoutMs = 15_000) {
    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to the browser.")), timeoutMs);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not connect to the browser.")); }, { once: true });
    });
    return new DevToolsSession(socket);
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 45_000): Promise<any> {
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (reason) => { clearTimeout(timer); reject(reason); },
      });
      this.socket.send(JSON.stringify(payload));
    });
  }

  once(method: string, sessionId: string, timeoutMs: number) {
    return new Promise<any>((resolve) => {
      const timer = setTimeout(() => { this.listeners.delete(listener); resolve(null); }, timeoutMs);
      const listener: Listener = (eventMethod, params, eventSession) => {
        if (eventMethod !== method || (sessionId && eventSession !== sessionId)) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(params);
      };
      this.listeners.add(listener);
    });
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // A socket that is already gone needs no closing.
    }
  }
}

/**
 * Opens one page in the connected browser, lets it finish loading, scrolls it the
 * way a person would to trigger lazy loading and infinite scroll, and returns the
 * rendered HTML. Optional click selector expands "load more" style listings.
 */
export async function renderPage(input: string, options: { scrolls?: number; settleMs?: number; clickSelector?: string } = {}): Promise<RenderedPage> {
  const url = await assertPublicHttpUrl(input);
  const endpoint = await resolveEndpoint();
  const maxScrolls = Math.max(0, Math.min(60, options.scrolls ?? 12));
  const settleMs = Math.max(500, Math.min(15_000, options.settleMs ?? 2500));

  const client = await DevToolsSession.open(endpoint);
  let targetId = "";
  try {
    const created = await client.send("Target.createTarget", { url: "about:blank" });
    targetId = created.targetId;
    const attached = await client.send("Target.attachToTarget", { targetId, flatten: true });
    const sessionId = attached.sessionId as string;

    await client.send("Page.enable", {}, sessionId);
    await client.send("Runtime.enable", {}, sessionId);
    await client.send("Emulation.setUserAgentOverride", { userAgent: HUMAN_USER_AGENT, acceptLanguage: "en-GB,en;q=0.9" }, sessionId);
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

    const loaded = client.once("Page.loadEventFired", sessionId, 45_000);
    await client.send("Page.navigate", { url: url.toString() }, sessionId);
    await loaded;
    await humanPause(settleMs);

    // Scroll in steps, stopping as soon as the page stops growing. Directories
    // that page by scrolling need this; ordinary pages exit after one check.
    let scrolls = 0;
    let lastHeight = 0;
    for (let step = 0; step < maxScrolls; step += 1) {
      const measured = await client.send("Runtime.evaluate", {
        expression: "window.scrollTo(0, document.body.scrollHeight); document.body.scrollHeight",
        returnByValue: true,
      }, sessionId);
      const height = Number(measured?.result?.value || 0);
      scrolls += 1;
      if (height <= lastHeight) break;
      lastHeight = height;
      await humanPause(900);
    }

    if (options.clickSelector) {
      for (let step = 0; step < 20; step += 1) {
        const clicked = await client.send("Runtime.evaluate", {
          expression: `(() => { const el = document.querySelector(${JSON.stringify(options.clickSelector)}); if (!el) return false; el.click(); return true; })()`,
          returnByValue: true,
        }, sessionId);
        if (!clicked?.result?.value) break;
        await humanPause(1200);
      }
    }

    const [htmlResult, titleResult, urlResult] = await Promise.all([
      client.send("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true }, sessionId),
      client.send("Runtime.evaluate", { expression: "document.title", returnByValue: true }, sessionId),
      client.send("Runtime.evaluate", { expression: "location.href", returnByValue: true }, sessionId),
    ]);

    return {
      url: String(urlResult?.result?.value || url.toString()),
      title: String(titleResult?.result?.value || ""),
      html: String(htmlResult?.result?.value || "").slice(0, 8_000_000),
      scrolls,
    };
  } finally {
    if (targetId) {
      try {
        await client.send("Target.closeTarget", { targetId });
      } catch {
        // Losing the tab is not worth failing a completed harvest for.
      }
    }
    client.close();
  }
}

/** What a visitor actually sees, plus measurements that settle questions of fact. */
export interface SiteVisuals {
  /** JPEG data URLs, ready to hand to a vision model. */
  desktop: string;
  mobile: string;
  signals: {
    hasViewportMeta: boolean;
    /** The page is wider than a phone screen, so it scrolls sideways. */
    mobileOverflows: boolean;
    mobileTextSizePx: number;
    bodyFont: string;
    stylesheets: number;
    usesDefaultBrowserFont: boolean;
  };
}

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/**
 * Photographs a homepage the way a first-time visitor meets it, on a laptop and
 * on a phone, and measures what can be measured: whether it adapts to a phone,
 * whether it scrolls sideways there, how big the text is, and which font it
 * uses. Returns null when no browser is connected, so an audit can say it was
 * not able to look rather than pretend it did.
 */
export async function captureSiteVisuals(input: string): Promise<SiteVisuals | null> {
  if (!browserConfigured()) return null;
  let url: URL;
  try { url = await assertPublicHttpUrl(input); } catch { return null; }
  let endpoint: string;
  try { endpoint = await resolveEndpoint(); } catch { return null; }

  const shoot = async (mobile: boolean) => {
    const client = await DevToolsSession.open(endpoint);
    let targetId = "";
    try {
      const created = await client.send("Target.createTarget", { url: "about:blank" });
      targetId = created.targetId;
      const attached = await client.send("Target.attachToTarget", { targetId, flatten: true });
      const sessionId = attached.sessionId as string;
      await client.send("Page.enable", {}, sessionId);
      await client.send("Runtime.enable", {}, sessionId);
      await client.send("Emulation.setUserAgentOverride", { userAgent: mobile ? MOBILE_USER_AGENT : HUMAN_USER_AGENT, acceptLanguage: "en-GB,en;q=0.9" }, sessionId);
      await client.send("Emulation.setDeviceMetricsOverride", mobile
        ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
        : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      const loaded = client.once("Page.loadEventFired", sessionId, 45_000);
      await client.send("Page.navigate", { url: url.toString() }, sessionId);
      await loaded;
      await humanPause(2500);
      const measured = await client.send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => {
          const body = document.body || document.documentElement;
          const style = getComputedStyle(body);
          const paragraph = document.querySelector("p, li, td, a") || body;
          return {
            hasViewportMeta: Boolean(document.querySelector('meta[name="viewport"]')),
            overflows: document.documentElement.scrollWidth > window.innerWidth + 4,
            textSize: parseFloat(getComputedStyle(paragraph).fontSize) || 0,
            bodyFont: style.fontFamily || "",
            stylesheets: document.styleSheets.length,
          };
        })()`,
      }, sessionId);
      const shot = await client.send("Page.captureScreenshot", { format: "jpeg", quality: 72, captureBeyondViewport: false }, sessionId);
      return { image: `data:image/jpeg;base64,${shot.data}`, measured: measured?.result?.value || {} };
    } finally {
      if (targetId) { try { await client.send("Target.closeTarget", { targetId }); } catch { /* tab already gone */ } }
      client.close();
    }
  };

  try {
    const desktop = await shoot(false);
    const mobile = await shoot(true);
    const font = String(desktop.measured.bodyFont || "");
    return {
      desktop: desktop.image,
      mobile: mobile.image,
      signals: {
        hasViewportMeta: Boolean(desktop.measured.hasViewportMeta),
        mobileOverflows: Boolean(mobile.measured.overflows),
        mobileTextSizePx: Number(mobile.measured.textSize) || 0,
        bodyFont: font,
        stylesheets: Number(desktop.measured.stylesheets) || 0,
        usesDefaultBrowserFont: /^\s*"?(times new roman|times|serif)"?\s*$/i.test(font) || font.trim() === "",
      },
    };
  } catch {
    return null;
  }
}
