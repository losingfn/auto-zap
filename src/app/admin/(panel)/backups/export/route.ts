import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/features/admin/auth";
import { buildActiveCatalogExport } from "@/features/admin/backups/service";

export async function GET() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exportFile = await buildActiveCatalogExport(session.user.id);
  return new NextResponse(new Uint8Array(exportFile.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFile.fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}
