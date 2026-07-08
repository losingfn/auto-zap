"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/features/admin/auth";
import {
  createAdminSynonym,
  deleteAdminSynonym,
  parseSynonymTargets,
  updateAdminSynonym
} from "@/features/admin/catalog-management";

function readSynonymForm(formData: FormData) {
  return {
    sourceTerm: String(formData.get("sourceTerm") ?? "").trim(),
    targetTerms: parseSynonymTargets(String(formData.get("targetTerms") ?? "")),
    isBidirectional: formData.get("isBidirectional") === "1",
    isActive: formData.get("isActive") === "1"
  };
}

export async function createSynonymAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/synonyms?saved=1";
  try {
    await createAdminSynonym({ ...readSynonymForm(formData), adminUserId: session.user.id });
  } catch {
    target = "/admin/synonyms?error=1";
  }
  redirect(target);
}

export async function updateSynonymAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/synonyms?saved=1";
  try {
    await updateAdminSynonym({
      synonymId: String(formData.get("synonymId") ?? ""),
      ...readSynonymForm(formData),
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/synonyms?error=1";
  }
  redirect(target);
}

export async function deleteSynonymAction(formData: FormData) {
  const session = await requireAdminSession();
  let target = "/admin/synonyms?deleted=1";
  try {
    await deleteAdminSynonym({
      synonymId: String(formData.get("synonymId") ?? ""),
      adminUserId: session.user.id
    });
  } catch {
    target = "/admin/synonyms?error=1";
  }
  redirect(target);
}
