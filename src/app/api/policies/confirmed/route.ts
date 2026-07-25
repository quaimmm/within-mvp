import { NextResponse } from "next/server";
import { readConfirmedArcPolicy } from "@/lib/policies/confirmed-arc-policy";

export const dynamic = "force-dynamic";

let cachedPolicy: Awaited<ReturnType<typeof readConfirmedArcPolicy>> | null = null;
let cachedAt = 0;
let pendingRead: ReturnType<typeof readConfirmedArcPolicy> | null = null;
const CACHE_DURATION_MS = 15_000;

export async function GET() {
  try {
    const now = Date.now();
    if (!cachedPolicy || now - cachedAt >= CACHE_DURATION_MS) {
      pendingRead ??= readConfirmedArcPolicy();
      cachedPolicy = await pendingRead;
      cachedAt = Date.now();
      pendingRead = null;
    }
    const policy = cachedPolicy;
    return NextResponse.json({
      success: true,
      policy: {
        exists: policy.exists,
        active: policy.active,
        maxPerTransaction: policy.maxPerTransaction.toString(),
        periodLimit: policy.periodLimit.toString(),
      },
    });
  } catch {
    pendingRead = null;
    return NextResponse.json(
      { success: false, error: "Arc policy state is temporarily unavailable." },
      { status: 503 },
    );
  }
}
