import { redirect } from "next/navigation";
import { logoutAdminSession } from "@/features/admin/auth";

export async function POST() {
  await logoutAdminSession();
  redirect("/admin/login");
}

export async function GET() {
  await logoutAdminSession();
  redirect("/admin/login");
}
