import { statfs } from "node:fs/promises";
import os from "node:os";
import { NextRequest, NextResponse } from "next/server";
import { listUploadSessions, UPLOAD_PREFIX } from "@/lib/tutorial-upload-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How much working space this server has, and what uploads are holding.
 *
 * The temporary disk here is 64MB, which is why holding video parts on it
 * failed with "no space left on device". Parts now live in the tutorial
 * bucket; this still reports the local disk, because the assembled video and
 * the compressor both need room to work.
 */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));
  let disk: Record<string, number | string> = {};
  try {
    const stats = await statfs(os.tmpdir());
    disk = {
      totalMB: mb(stats.blocks * stats.bsize),
      freeMB: mb(stats.bavail * stats.bsize),
      usedPercent: Math.round(((stats.blocks - stats.bavail) / Math.max(1, stats.blocks)) * 100),
    };
  } catch (error) {
    disk = { error: error instanceof Error ? error.message : "unreadable" };
  }

  const sessions = await listUploadSessions();
  return NextResponse.json({
    ok: true,
    tmpdir: os.tmpdir(),
    partsHeldIn: `tutorial bucket, ${UPLOAD_PREFIX}/`,
    disk,
    uploads: {
      sessions: sessions.length,
      heldMB: mb(sessions.reduce((total, item) => total + item.bytes, 0)),
      detail: sessions.slice(0, 12),
    },
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
