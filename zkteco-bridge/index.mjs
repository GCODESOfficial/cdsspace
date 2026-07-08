/**
 * CDS Space - ZKTeco Time Machine bridge agent.
 *
 * A browser cannot read a USB ZKTeco fingerprint reader directly, so this small
 * local service runs on the kiosk PC and exposes the reader over localhost HTTP
 * for the admin Time Machine portal.
 *
 * Plug-and-play: with the ZKFinger SDK installed (see README) and a reader
 * connected, the bridge auto-detects the hardware. With no reader/SDK it falls
 * back to a simulator so the portal stays usable. Force a mode with ZK_DRIVER.
 *
 * Contract (consumed by src/lib/biometric/bridge-client.ts):
 *   GET  /health   -> { ok, device:{connected,model,serial}, enrolledCount, mode, version }
 *   POST /sync     <- { templates:[{id,memberId,finger,template,format}] } -> { ok, loaded }
 *   POST /capture  -> { ok, template, format, quality }            (enrollment)
 *   POST /identify -> { ok, matched, memberId?, finger?, score?, quality? }  (1:N)
 *
 * Run:  npm install && npm start
 */
import express from "express";
import cors from "cors";
import { loadZkfinger, koffiAvailable, TEMPLATE_MAX, IMAGE_MAX } from "./zkfinger-sdk.mjs";

const PORT = Number(process.env.ZK_BRIDGE_PORT || 8787);
const MODE = (process.env.ZK_DRIVER || "auto").toLowerCase(); // auto | zkfinger | simulator
const VERSION = "0.2.0";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Source-of-truth template cache, synced from the portal (DB-backed). */
const templates = new Map(); // id -> { id, memberId, finger, template, format }

/* ─────────────── Simulator driver ─────────────── */

function createSimulatorDriver() {
  const rand = (n) => Math.floor(Math.random() * n);
  const token = () => Buffer.from(Array.from({ length: 24 }, () => rand(256))).toString("base64");
  return {
    name: "simulator",
    ensure: () => true,
    info: () => ({ connected: true, model: "ZK Simulator", serial: "SIM-0001" }),
    clear() {},
    register() {},
    async capture() {
      await sleep(500);
      return { template: `SIM:${token()}`, format: "sim", quality: 70 + rand(30) };
    },
    async identify() {
      await sleep(500);
      const all = [...templates.values()];
      if (all.length === 0) return { matched: false };
      const hit = all[rand(all.length)];
      return { matched: true, memberId: hit.memberId, finger: hit.finger, score: 88 + rand(10), quality: 75 + rand(20) };
    },
  };
}

/* ─────────────── ZKFinger hardware driver (libzkfp) ─────────────── */

function createZkfingerDriver() {
  const state = {
    sdk: null, initialized: false, hDev: null, hDB: null,
    connected: false, lastError: null,
    fidMap: new Map(), fidSeq: 1, dpUpload: [],
  };

  function ensure() {
    if (state.connected) return true;
    if (!koffiAvailable()) { state.lastError = "koffi FFI not installed"; return false; }
    try {
      if (!state.sdk) state.sdk = loadZkfinger(process.env.ZKFINGER_DLL);
      if (!state.initialized) { state.sdk.Init(); state.initialized = true; }
      const count = state.sdk.GetDeviceCount();
      if (!Number.isFinite(count) || count <= 0) { state.lastError = "No ZKTeco reader detected"; return false; }
      state.hDev = state.sdk.OpenDevice(0);
      if (!state.hDev) { state.lastError = "Could not open reader (device 0)"; return false; }
      if (!state.hDB) state.hDB = state.sdk.DBInit();
      state.connected = true;
      state.lastError = null;
      return true;
    } catch (e) {
      state.lastError = e?.message || "ZKFinger init failed";
      state.connected = false;
      return false;
    }
  }

  // Mark disconnected so the next call re-probes (handles unplug/replug).
  function drop(msg) {
    state.connected = false;
    state.hDev = null;
    state.lastError = msg || state.lastError;
  }

  async function acquireOnce(timeoutMs = 15000) {
    const img = Buffer.alloc(IMAGE_MAX);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const tmpl = Buffer.alloc(TEMPLATE_MAX);
      const size = [TEMPLATE_MAX];
      const ret = state.sdk.Acquire(state.hDev, img, img.length, tmpl, size);
      if (ret === 0 && size[0] > 0) return Buffer.from(tmpl.subarray(0, size[0]));
      await sleep(200);
    }
    throw new Error("No finger detected - place the finger firmly on the reader and retry.");
  }

  // Wait for the finger to be lifted so the next sample is a fresh press.
  async function waitFingerUp(timeoutMs = 5000) {
    const img = Buffer.alloc(IMAGE_MAX);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const tmpl = Buffer.alloc(TEMPLATE_MAX);
      const size = [TEMPLATE_MAX];
      const ret = state.sdk.Acquire(state.hDev, img, img.length, tmpl, size);
      if (ret !== 0) return;
      await sleep(150);
    }
  }

  return {
    name: "zkfinger",
    ensure,
    lastError: () => state.lastError,
    info: () => ({
      connected: state.connected,
      model: state.connected ? "ZKTeco USB Reader" : "ZKTeco (disconnected)",
      serial: process.env.ZK_DEVICE_SERIAL || "auto",
    }),
    clear() {
      state.fidMap.clear();
      state.fidSeq = 1;
      try { if (state.hDB) state.sdk.DBClear(state.hDB); } catch { /* ignore */ }
    },
    register(t) {
      if (!ensure()) return;
      try {
        const buf = Buffer.from(String(t.template || ""), "base64");
        if (buf.length === 0) return; // skips non-hardware (e.g. SIM:) templates
        const fid = state.fidSeq++;
        const ret = state.sdk.DBAdd(state.hDB, fid, buf, buf.length);
        if (ret === 0) state.fidMap.set(fid, { memberId: t.memberId, finger: t.finger });
      } catch { /* skip a bad template, keep the rest */ }
    },
    async capture() {
      if (!ensure()) throw new Error(state.lastError || "Reader not connected");
      try {
        // ZKTeco enrollment merges three presses into one registration template.
        const s1 = await acquireOnce(); await waitFingerUp();
        const s2 = await acquireOnce(); await waitFingerUp();
        const s3 = await acquireOnce();
        const reg = Buffer.alloc(TEMPLATE_MAX);
        const size = [TEMPLATE_MAX];
        const ret = state.sdk.DBMerge(state.hDB, s1, s2, s3, reg, size);
        const out = ret === 0 && size[0] > 0 ? reg.subarray(0, size[0]) : s1;
        return { template: Buffer.from(out).toString("base64"), format: "zk", quality: 80 };
      } catch (e) {
        if (/device|open|handle/i.test(e?.message || "")) drop(e.message);
        throw e;
      }
    },
    async identify() {
      if (!ensure()) throw new Error(state.lastError || "Reader not connected");
      try {
        const probe = await acquireOnce();
        const fid = [0];
        const score = [0];
        const ret = state.sdk.DBIdentify(state.hDB, probe, probe.length, fid, score);
        if (ret !== 0) return { matched: false };
        const meta = state.fidMap.get(fid[0]);
        if (!meta) return { matched: false };
        return { matched: true, memberId: meta.memberId, finger: meta.finger, score: score[0], quality: 80 };
      } catch (e) {
        if (/device|open|handle/i.test(e?.message || "")) drop(e.message);
        throw e;
      }
    },
  };
}

/* ─────────────── Driver selection (auto / forced) ─────────────── */

const simulator = createSimulatorDriver();
const hardware = createZkfingerDriver();
let lastActive = null;

function activeDriver() {
  let d;
  if (MODE === "simulator") d = simulator;
  else if (MODE === "zkfinger") d = hardware; // forced; errors surface to operator
  else d = hardware.ensure() ? hardware : simulator; // auto

  // When the active driver changes (e.g. a reader was just plugged in), load
  // the current template set into it so 1:N works immediately.
  if (d !== lastActive) {
    try {
      d.clear();
      for (const t of templates.values()) d.register(t);
    } catch { /* ignore */ }
    lastActive = d;
  }
  return d;
}

/* ─────────────── HTTP server ─────────────── */

const app = express();
app.use(cors()); // localhost agent; no cookies/credentials are exchanged.
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  const d = activeDriver();
  let device = { connected: false };
  try { device = d.info(); } catch { /* report disconnected */ }
  res.json({
    ok: true,
    device,
    enrolledCount: templates.size,
    mode: d.name,
    forced: MODE,
    hint: d.name === "zkfinger" ? undefined : hardware.lastError?.(),
    version: VERSION,
  });
});

app.post("/sync", (req, res) => {
  const incoming = Array.isArray(req.body?.templates) ? req.body.templates : [];
  templates.clear();
  for (const t of incoming) {
    if (!t?.id || !t?.memberId || !t?.template) continue;
    templates.set(t.id, {
      id: t.id, memberId: t.memberId, finger: t.finger || "right_thumb",
      template: t.template, format: t.format || "zk",
    });
  }
  // Load into whichever driver is active right now.
  const d = activeDriver();
  try {
    d.clear();
    for (const t of templates.values()) d.register(t);
  } catch { /* ignore */ }
  lastActive = d;
  res.json({ ok: true, loaded: templates.size });
});

app.post("/capture", async (_req, res) => {
  try {
    const out = await activeDriver().capture();
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "Capture failed" });
  }
});

app.post("/identify", async (_req, res) => {
  try {
    const out = await activeDriver().identify();
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "Identify failed" });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  const d = activeDriver();
  console.log(`CDS ZKTeco bridge v${VERSION} - mode="${MODE}" active="${d.name}" - http://127.0.0.1:${PORT}`);
  if (d.name === "simulator") {
    const why = hardware.lastError?.();
    console.log(`Running in SIMULATOR${why ? ` (${why})` : ""}. Connect a ZKTeco reader with the ZKFinger SDK installed to go live.`);
  } else {
    console.log("ZKTeco reader connected - live fingerprint mode.");
  }
});
