import { isAnalyticsLocationAllowed, isSafeAnalyticsReferrer } from "./domain";

type Metrika = ((id: number, method: string, options?: unknown, extra?: unknown) => void) & {
  a?: unknown[][]; l?: number;
};
declare global { interface Window { ym?: Metrika; } }
let generation = 0;
let activeId: number | null = null;
let requestedId: number | null = null;
let script: HTMLScriptElement | null = null;
let sdkLoaded = false;
let loading: Promise<void> | null = null;
let currentPath = "";
let routeVisit = 0;
let lastPageview: { id: number; grantKey: string; visit: number } | null = null;
let withdrawnId: number | null = null;

export const RESTRICTED_METRIKA_OPTIONS = {
  defer: true, webvisor: false, clickmap: false, trackLinks: false,
  trackHash: false, ecommerce: false, accurateTrackBounce: false,
  sendTitle: false, childIframe: false, disableYtm: true
} as const;

export function isAnalyticsResident() { return sdkLoaded || script !== null || activeId !== null; }

/** Observe navigation even while consent/settings/visibility prohibit sending. */
export function observeAnalyticsRoute() {
  const path = location.origin + location.pathname;
  if (currentPath !== path) { currentPath = path; routeVisit++; }
}

/** A temporary stop fences the SDK, but does not create a new document visit. */
export function stopAnalytics() {
  const ownedId = activeId ?? requestedId;
  // Block the SDK before destruct, including a library that is still loading.
  if (ownedId !== null) Object.assign(window, { [`disableYaCounter${ownedId}`]: true });
  requestedId = null;
  generation++;
  if (activeId !== null) {
    const id = activeId;
    activeId = null;
    // Official method is destruct. Already transmitted requests cannot be recalled.
    try { window.ym?.(id, "destruct"); } catch { /* Keep local analytics disabled. */ }
    try {
      for (const suffix of ["lastHit", "lsid", "reqNum"]) window.localStorage.removeItem(`_ym${id}_${suffix}`);
    } catch { /* Storage may be disabled. Do not touch shopping/navigation/admin data. */ }
  }
  if (ownedId !== null) {
    Object.assign(window, { [`disableYaCounter${ownedId}`]: true });
    const queue = window.ym?.a;
    if (queue) for (let i = queue.length - 1; i >= 0; i--) if (queue[i]?.[0] === ownedId) queue.splice(i, 1);
  }
  // Removing a pending tag cannot reliably abort execution. Share that one load
  // with a renewed grant; generation still fences every withdrawn caller.
  if (!loading) { script?.remove(); script = null; }
}

/** Only a refusal/withdrawal clears vendor data; ordinary pauses retain it. */
export function withdrawAnalytics(id: number | null) {
  withdrawnId = id;
  lastPageview = null;
  stopAnalytics();
  if (id !== null) {
    Object.assign(window, { [`disableYaCounter${id}`]: true });
    const queue = window.ym?.a;
    if (queue) for (let i = queue.length - 1; i >= 0; i--) if (queue[i]?.[0] === id) queue.splice(i, 1);
  }
  clearMetrikaStorage(id);
}

function clearMetrikaStorage(id: number | null) {
  const common = new Set(["_ym_uid", "_ym_retryReqs", "_ym_hide_phones", "_ym_debugger_state", "_ym_turbo_uid"]);
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[kind];
      for (const key of Object.keys(storage)) {
        if (common.has(key) || id !== null && (
          ["lastHit", "lsid", "reqNum"].some((suffix) => key === `_ym${id}_${suffix}`) ||
          key.startsWith(`ytm_tf_${id}_`) || key.startsWith(`ytm_tag_${id}_`))) storage.removeItem(key);
      }
    } catch { /* Denied storage must never restore analytics. */ }
  }
  // Documented Metrika names only. Do not clear consent proofs, sessions or unrelated cookies.
  const cookies = new Set(["_ym_uid", "_ym_d", "_ym_isad", "_ym_metrika_enabled", "_ym_fa", "_ym_ucs",
    "_ym_debug", "_ym_hostIndex", "_ym_sup_debug"]);
  if (id !== null) cookies.add(`_ym_visorc_${id}`);
  try {
    const host = location.hostname;
    const domains = [""];
    const labels = host.split(".");
    for (let index = 0; index < labels.length - 1; index++) {
      const domain = labels.slice(index).join(".");
      domains.push(`; Domain=${domain}`, `; Domain=.${domain}`);
    }
    const paths = new Set(["/"]);
    const segments = location.pathname.split("/").filter(Boolean);
    for (let index = 1; index <= segments.length; index++) {
      const path = "/" + segments.slice(0, index).join("/"); paths.add(path); paths.add(path + "/");
    }
    for (const pair of document.cookie.split(";")) {
      const name = pair.trim().split("=")[0];
      if (!cookies.has(name)) continue;
      for (const domain of domains) for (const path of paths) {
        document.cookie = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${path}${domain}`;
      }
    }
  } catch { /* HttpOnly, other domains/paths and browser restrictions are outside this document's control. */ }
}

export async function updateAnalytics(id: number | null, ready: boolean, authorized: () => boolean, grantKey = "") {
  observeAnalyticsRoute();
  const allowed = () => ready && id !== null && authorized() &&
    Boolean(document.querySelector('[data-autozap-analytics-page="true"]')) &&
    isAnalyticsLocationAllowed(new URL(location.href)) && isSafeAnalyticsReferrer(document.referrer, location.origin);
  if (!allowed() || id === null) { stopAnalytics(); return; }
  requestedId = id;
  const currentGeneration = generation;
  if (!sdkLoaded) {
    if (!window.ym) {
      const queue: Metrika = (counter, method, options, extra) => { queue.a?.push([counter, method, options, extra]); };
      queue.a = [];
      queue.l = Date.now();
      window.ym = queue;
    }
    if (!loading) {
      script = document.createElement("script");
      script.src = "https://mc.yandex.ru/metrika/tag.js";
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.dataset.autozapAnalytics = "true";
      loading = new Promise<void>((resolve, reject) => {
        const tag = script!;
        const fail = () => {
          window.clearTimeout(timeout);
          if (script === tag) { tag.remove(); script = null; loading = null; }
          reject(new Error("Analytics unavailable"));
        };
        const timeout = window.setTimeout(fail, 10_000);
        tag.onload = () => {
          window.clearTimeout(timeout);
          if (script === tag) {
            loading = null;
            if (requestedId === null) { tag.remove(); script = null; }
          }
          sdkLoaded = true;
          // A removed script can still finish executing after withdrawal.
          if (withdrawnId !== null) clearMetrikaStorage(withdrawnId);
          resolve();
        };
        tag.onerror = fail;
        document.head.appendChild(tag);
      });
    }
    try {
      await loading;
    } catch { if (currentGeneration === generation) stopAnalytics(); return; }
  }
  // Late callbacks, a new tab decision, an expired receipt, a route or modal change cannot activate it.
  if (currentGeneration !== generation || !allowed()) return;
  try {
    if (activeId !== id) {
      withdrawnId = null;
      Object.assign(window, { [`disableYaCounter${id}`]: false });
      window.ym?.(id, "init", RESTRICTED_METRIKA_OPTIONS);
      activeId = id;
    }
    const url = location.origin + location.pathname;
    if (lastPageview?.id !== id || lastPageview.grantKey !== grantKey || lastPageview.visit !== routeVisit) {
      window.ym?.(id, "hit", url, { referer: "", title: "Автозапчасти в Талдоме" });
      lastPageview = { id, grantKey, visit: routeVisit };
    }
  } catch { stopAnalytics(); }
}

/** A sensitive search must leave the document that hosted the SDK, even during an unfinished load. */
export function leaveAnalyticsDocument(href: string): boolean {
  if (!isAnalyticsResident()) return false;
  stopAnalytics();
  window.location.assign(href);
  return true;
}
