import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";
import puppeteer from "puppeteer";

config();

const baseUrl = process.env.CMEET_SMOKE_BASE_URL || "http://localhost:3000";
const testTranslation = process.env.CMEET_SMOKE_TRANSLATION === "1";
const participantCount = Math.max(2, Number.parseInt(process.env.CMEET_SMOKE_PARTICIPANTS || "3", 10) || 3);
const forceRelay = process.env.CMEET_SMOKE_FORCE_RELAY === "1";
const databaseUrl = process.env.GLASHDB_DIRECT_URL
  || process.env.DIRECT_URL
  || process.env.GLASHDB_DATABASE_URL
  || process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("A database connection is required for the cMeet smoke test.");

const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
const result = await db.query(`
  select room_code, guest_token
    from team_meetings
   where status in ('live', 'scheduled')
     and guest_token is not null
   order by created_at desc
   limit 1
`);
await db.end();

const room = result.rows[0];
if (!room?.room_code || !room?.guest_token) {
  throw new Error("No active tokenised cMeet room is available for the browser smoke test.");
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CMEET_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--no-sandbox",
  ],
});

async function preparePage(name, translate = false) {
  const joinStartedAt = Date.now();
  const page = await browser.newPage();
  const diagnostics = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) diagnostics.push(`console ${message.type()}: ${message.text().slice(0, 180)}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/cmeet/")) {
      const url = new URL(response.url());
      diagnostics.push(`HTTP ${response.status()} ${url.pathname}`);
    }
  });
  await page.evaluateOnNewDocument((relayOnly) => {
    const NativePeerConnection = window.RTCPeerConnection;
    window.__cmeetSmokeConnections = [];
    window.RTCPeerConnection = class extends NativePeerConnection {
      constructor(configuration, ...args) {
        super(relayOnly ? { ...configuration, iceTransportPolicy: "relay" } : configuration, ...args);
        window.__cmeetSmokeConnections.push(this);
      }
    };
  }, forceRelay);
  const joinUrl = `${baseUrl}/meet/${encodeURIComponent(room.room_code)}?g=${encodeURIComponent(room.guest_token)}`;
  await page.goto(joinUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[placeholder="Alex Doe"]', { timeout: 30_000 });
  await page.type('input[placeholder="Alex Doe"]', name);
  if (translate) {
    await page.click('input[aria-label="Enable live translation"]');
  }
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Join meeting"));
    return button instanceof HTMLButtonElement && !button.disabled;
  }, { timeout: 10_000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Join meeting"));
    if (!(button instanceof HTMLButtonElement)) throw new Error("Join button was not found.");
    button.click();
  });
  // The button text changes to "Connecting…" immediately, so disappearance
  // of "Join meeting" is not enough. The mute control only exists once the
  // admission, media and signaling sequence has all completed.
  try {
    await page.waitForSelector('button[title="Mute"]', { timeout: 30_000 });
  } catch (error) {
    const visibleMessage = await page.evaluate(() => {
      const messages = [...document.querySelectorAll("div, p")]
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
        .map((element) => element.textContent?.trim() || "")
        .filter((text) => /couldn|failed|denied|unavailable|waiting|permission/i.test(text));
      const buttons = [...document.querySelectorAll("button")]
        .map((button) => button.title || button.textContent?.trim() || "")
        .filter(Boolean)
        .slice(-8)
        .join(", ");
      return messages.at(-1)?.slice(0, 240) || `No visible error message; controls: ${buttons || "none"}`;
    });
    throw new Error(`${name} could not join: ${visibleMessage}; ${diagnostics.slice(-6).join("; ") || "no browser diagnostics"}`, { cause: error });
  }
  return { page, joinMs: Date.now() - joinStartedAt, diagnostics };
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const connections = window.__cmeetSmokeConnections || [];
    const totals = [];
    for (const connection of connections) {
      const total = {
        state: connection.connectionState,
        inboundAudio: 0,
        outboundAudio: 0,
        inboundVideo: 0,
        outboundVideo: 0,
        candidateRoute: "unknown",
        rttMs: null,
      };
      const stats = await connection.getStats();
      let selectedPair = null;
      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && !report.isRemote) {
          if (report.kind === "audio") total.inboundAudio += report.bytesReceived || 0;
          if (report.kind === "video") total.inboundVideo += report.bytesReceived || 0;
        }
        if (report.type === "outbound-rtp" && !report.isRemote) {
          if (report.kind === "audio") total.outboundAudio += report.bytesSent || 0;
          if (report.kind === "video") total.outboundVideo += report.bytesSent || 0;
        }
        if (report.type === "transport" && report.selectedCandidatePairId) {
          selectedPair = stats.get(report.selectedCandidatePairId) || selectedPair;
        }
        if (report.type === "candidate-pair" && report.state === "succeeded" && (report.selected || report.nominated)) {
          selectedPair = report;
        }
      });
      if (selectedPair) {
        const local = stats.get(selectedPair.localCandidateId);
        const remote = stats.get(selectedPair.remoteCandidateId);
        total.candidateRoute = `${local?.candidateType || "?"}->${remote?.candidateType || "?"}`;
        total.rttMs = Number.isFinite(selectedPair.currentRoundTripTime)
          ? Math.round(selectedPair.currentRoundTripTime * 1000)
          : null;
      }
      totals.push(total);
    }
    return {
      totals,
      liveVideos: [...document.querySelectorAll("video")].filter((video) => video.readyState >= 2 && video.videoWidth > 0).length,
      playingAudio: [...document.querySelectorAll("audio")].filter((audio) => !audio.muted && !audio.paused && audio.srcObject).length,
    };
  });
}

function assertDuplexMedia(label, state) {
  assert.equal(state.totals.length, participantCount - 1, `${label} did not create the full ${participantCount}-person mesh`);
  for (const [index, mesh] of state.totals.entries()) {
    assert.ok(mesh.inboundAudio > 0 && mesh.outboundAudio > 0
      && mesh.inboundVideo > 0 && mesh.outboundVideo > 0,
    `${label} connection ${index + 1} did not send and receive both audio and video`);
    assert.equal(mesh.state, "connected", `${label} connection ${index + 1} was not connected`);
  }
  assert.ok(state.liveVideos >= participantCount, `${label} did not paint all ${participantCount} videos`);
  assert.ok(state.playingAudio >= participantCount - 1, `${label} did not have all remote audio routes`);
}

const participants = [];
try {
  for (let index = 0; index < participantCount; index += 1) {
    participants.push(await preparePage(`cMeet smoke ${String.fromCharCode(65 + index)}`, testTranslation && index === 1));
  }
  const connectionDeadline = Date.now() + 60_000;
  let states = [];
  while (Date.now() < connectionDeadline) {
    states = await Promise.all(participants.map(({ page }) => snapshot(page)));
    if (states.every((state) => state.totals.length === participantCount - 1
      && state.totals.every((connection) => connection.state === "connected"))) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!states.every((state) => state.totals.length === participantCount - 1
    && state.totals.every((connection) => connection.state === "connected"))) {
    throw new Error(`Peers did not form the full mesh: ${JSON.stringify(states)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, testTranslation ? 12_000 : 5_000));
  states = await Promise.all(participants.map(({ page }) => snapshot(page)));
  states.forEach((state, index) => assertDuplexMedia(`Participant ${String.fromCharCode(65 + index)}`, state));
  if (testTranslation) {
    const translatedState = states[1];
    assert.ok(translatedState.totals.length >= participantCount, "The listener did not create an independent S2S connection");
    assert.ok(translatedState.totals.some((total) => total.outboundAudio > 0 && total.inboundAudio > 0), "S2S did not exchange realtime audio");
  }
  const joinTimes = participants.map(({ joinMs }) => joinMs);
  const routes = states.map((state) => state.totals.map((connection) => `${connection.candidateRoute}/${connection.rttMs ?? "?"}ms`));
  console.log(`cMeet ${participantCount}-participant browser smoke passed (${testTranslation ? "media + S2S" : "media"}${forceRelay ? ", relay-only" : ""}) against ${new URL(baseUrl).host}; joins=${joinTimes.join(",")}ms; routes=${JSON.stringify(routes)}.`);
} finally {
  const closed = Promise.allSettled(participants.map(({ page }) => page.close()))
    .then(() => browser.close());
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 3_000))]);
  // Active TURN sockets can keep headless Chrome alive after every page has
  // closed. A smoke test must always return control to CI.
  const browserProcess = browser.process();
  try { browser.disconnect(); } catch { /* already closed */ }
  try { browserProcess?.kill("SIGTERM"); } catch { /* already exited */ }
}

// Puppeteer's pipe can retain an idle Node handle after Chrome has exited on
// some macOS runners. Reaching this line means every assertion and cleanup
// step succeeded; make the smoke command deterministic for CI.
process.exit(0);
