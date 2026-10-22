import { createHash } from "node:crypto";
import original from "./consent-archive/f801a44356ed08df59a848e25c006cd540e74efcf4a4dd08c50dd29057095d82.json";
import previous from "./consent-archive/68c4940ac114864a8ea1c01c84a3a9a523883c91502dfe2a1e5ce914f57d774f.json";
import beforeEditorial from "./consent-archive/fb04265427e62aa06f973097cfce9908925a25e8c077b244be16d56724d97a19.json";
import current from "./consent-archive/5223be25807dee522acde9e3ead5060d86092678ddbf6949d7eeca79e9e2a550.json";

/** Append new keys; never repoint a previously registered key to another text. */
const registry = {
  "sha256:f801a44356ed08df59a848e25c006cd540e74efcf4a4dd08c50dd29057095d82": original,
  "sha256:68c4940ac114864a8ea1c01c84a3a9a523883c91502dfe2a1e5ce914f57d774f": previous,
  "sha256:fb04265427e62aa06f973097cfce9908925a25e8c077b244be16d56724d97a19": beforeEditorial,
  "sha256:5223be25807dee522acde9e3ead5060d86092678ddbf6949d7eeca79e9e2a550": current
} as const;
export const archivedAnalyticsConsents = Object.values(registry);

export function archivedConsent(version: string) {
  const document = Object.hasOwn(registry, version) ? registry[version as keyof typeof registry] : null;
  if (!document || document.version !== version || `sha256:${createHash("sha256").update(document.text, "utf8").digest("hex")}` !== version) {
    throw new Error("Consent archive is missing or inconsistent");
  }
  return document;
}
