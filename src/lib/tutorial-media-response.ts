import "server-only";

import { NextResponse } from "next/server";
import { getGlashDbAdmin } from "@/lib/glashdb";
import { TUTORIAL_BUCKET } from "@/lib/tutorials";

export async function tutorialMediaResponse(request: Request, asset: { path: string; mime: string; name: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getGlashDbAdmin() as any;
  const { data, error } = await db.storage.from(TUTORIAL_BUCKET).download(asset.path);
  if (error || !data) return NextResponse.json({ error: "Tutorial media could not be loaded." }, { status: 404 });
  const bytes = Buffer.from(await data.arrayBuffer());
  const range = request.headers.get("range");
  const common = {
    "Content-Type": asset.mime,
    "Accept-Ranges": "bytes",
    "Content-Disposition": `inline; filename="${asset.name.replace(/["\\\r\n]/g, "_")}"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
  if (!range) return new NextResponse(bytes, { status: 200, headers: { ...common, "Content-Length": String(bytes.byteLength) } });
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.byteLength}` } });
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= bytes.byteLength) {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.byteLength}` } });
  }
  const chunk = bytes.subarray(start, end + 1);
  return new NextResponse(chunk, {
    status: 206,
    headers: { ...common, "Content-Length": String(chunk.byteLength), "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}` },
  });
}
