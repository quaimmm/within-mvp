import { NextResponse } from "next/server";
import { createHealthResponse } from "@/lib/demo/health";
import { validateArcRpc } from "@/lib/arc/network";

export const runtime = "nodejs";

export async function GET() {
  let rpcAvailable = false;
  try { rpcAvailable = await validateArcRpc(); } catch { rpcAvailable = false; }
  return NextResponse.json(createHealthResponse(process.env, rpcAvailable));
}
