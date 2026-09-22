import { GET as getSharedStickers, POST as saveSharedSticker } from "@/app/api/chat/stickers/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return getSharedStickers(req);
}

export async function POST(req: Request) {
  return saveSharedSticker(req);
}
