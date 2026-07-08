import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/features/admin/auth";

export async function GET() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: session.user,
    expiresAt: session.expiresAt.toISOString()
  });
}
