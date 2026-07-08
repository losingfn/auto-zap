import { eq } from "drizzle-orm";
import { defaultSearchSynonyms } from "@/config/search-synonyms";
import { db } from "@/db/client";
import { synonyms } from "@/db/schema";
import { normalizeSearchText } from "./normalization";
import type { SearchSynonymRecord } from "./types";

export function getDefaultSearchSynonyms(): SearchSynonymRecord[] {
  return defaultSearchSynonyms.map((synonym) => ({
    sourceTerm: synonym.source,
    targetTerms: synonym.targetTerms,
    isBidirectional: synonym.isBidirectional ?? true
  }));
}

export async function getSearchSynonyms() {
  const dbSynonyms = await db
    .select({
      sourceTerm: synonyms.sourceTerm,
      targetTerms: synonyms.targetTerms,
      isBidirectional: synonyms.isBidirectional
    })
    .from(synonyms)
    .where(eq(synonyms.isActive, true));

  return mergeSynonyms([...getDefaultSearchSynonyms(), ...dbSynonyms]);
}

export function mergeSynonyms(records: SearchSynonymRecord[]) {
  const merged = new Map<string, SearchSynonymRecord>();

  for (const record of records) {
    const sourceTerm = normalizeSearchText(record.sourceTerm);
    if (!sourceTerm) {
      continue;
    }

    const current = merged.get(sourceTerm) ?? {
      sourceTerm,
      targetTerms: [],
      isBidirectional: record.isBidirectional
    };

    current.isBidirectional = current.isBidirectional || record.isBidirectional;
    current.targetTerms = [
      ...new Set([
        ...current.targetTerms.map(normalizeSearchText),
        ...record.targetTerms.map(normalizeSearchText)
      ])
    ].filter((term) => term && term !== sourceTerm);
    merged.set(sourceTerm, current);
  }

  return [...merged.values()];
}

export function buildMeiliSynonyms(records: SearchSynonymRecord[]) {
  const map: Record<string, string[]> = {};

  for (const record of records) {
    const source = normalizeSearchText(record.sourceTerm);
    const targets = record.targetTerms.map(normalizeSearchText).filter(Boolean);
    if (!source || targets.length === 0) {
      continue;
    }

    map[source] = [...new Set([...(map[source] ?? []), ...targets])];
    if (record.isBidirectional) {
      for (const target of targets) {
        map[target] = [...new Set([...(map[target] ?? []), source, ...targets.filter((item) => item !== target)])];
      }
    }
  }

  return map;
}
