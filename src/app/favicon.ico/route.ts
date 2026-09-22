import { NextRequest, NextResponse } from "next/server";
import { absoluteApplicationUrl } from "@/lib/public-site";

export function GET(request: NextRequest) {
  return NextResponse.redirect(absoluteApplicationUrl("/favicon.png", request), 308);
}
