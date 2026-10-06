#!/usr/bin/env node
// `npm run dev`: runs `next dev`, then makes sure nested routes are routable.
//
// Next 16.3's dev server builds its route table from file-watcher batches that
// arrive in pieces at startup (top-level folders first, nested ones later). Each
// batch starts an async rebuild, and a slow rebuild from an early batch can
// finish last, so /api/mobile/v1/*, /api/security/bot-challenge and every other
// nested route answer 404 until some file changes. Once the server is up, this
// checks a nested route and, if it is missing, briefly adds and removes a file
// so Next rescans with the complete file list.

import { spawn } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = process.env.CDS_NEXT_DIST_DIR || ".next";
const lockFile = path.join(root, distDir, "dev", "lock");
const nudgeFile = path.join(root, "src", "app", ".dev-route-rescan");
const probePath = "/api/security/bot-challenge";

const next = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => next.kill(signal));
next.on("exit", (code, signal) => {
  clearInterval(timer);
  try { unlinkSync(nudgeFile); } catch {}
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readLock() {
  try {
    const lock = JSON.parse(readFileSync(lockFile, "utf8"));
    return lock.appUrl && lock.startedAt ? lock : null;
  } catch {
    return null;
  }
}

// OPTIONS is answered by Next itself for any route handler (204), so it runs no app code.
async function probe(appUrl) {
  try {
    const response = await fetch(new URL(probePath, appUrl), { method: "OPTIONS" });
    return response.status;
  } catch {
    return null; // not listening yet
  }
}

async function ensureRoutes(lock) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await probe(lock.appUrl);
    if (status !== null && status !== 404) return;
    if (status === 404) {
      writeFileSync(nudgeFile, "");
      await wait(500);
      try { unlinkSync(nudgeFile); } catch {}
    }
    await wait(1500);
  }
  console.warn(`\n[dev] ${probePath} still answers 404. Re-save any file under src/app to rescan routes.\n`);
}

// Next restarts its server (new lock) when next.config or .env changes, so check after every start.
let checkedStart = null;
let checking = false;
const timer = setInterval(async () => {
  const lock = readLock();
  if (!lock || lock.startedAt === checkedStart || checking) return;
  checking = true;
  checkedStart = lock.startedAt;
  await ensureRoutes(lock);
  checking = false;
}, 1000);
