import { NextResponse } from "next/server";
import { createHealthResponse } from "@/lib/demo/health";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(createHealthResponse());
}
