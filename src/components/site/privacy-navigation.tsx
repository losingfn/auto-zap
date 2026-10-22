"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons/lucide";
import { isAnalyticsResident, leaveAnalyticsDocument } from "@/features/privacy/analytics";

const RETURN_KEY = "autozap:privacy-return:v1";
const RESTORE_KEY = "autozap:privacy-scroll:v1";
const DOCUMENT_KEY = "autozap:privacy-document-transition:v1";
const SOURCE_STATE = "privacySourceToken";
const PRIVACY_STATE = "privacyReturnToken";

type ReturnLocation = { token: string; href: string; scrollY: number };
let pendingNavigation: ReturnLocation | null = null;

function readReturnLocation(): ReturnLocation | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<ReturnLocation>;
    if (typeof record.token !== "string" || typeof record.href !== "string" ||
      typeof record.scrollY !== "number" || !Number.isFinite(record.scrollY) || record.scrollY < 0 ||
      !record.href.startsWith("/") || record.href.startsWith("//")) return null;
    const url = new URL(record.href, location.origin);
    if (url.origin !== location.origin || /^\/privacy\/?$/.test(url.pathname)) return null;
    return record as ReturnLocation;
  } catch {
    return null;
  }
}

function rememberReturnLocation() {
  if (/^\/privacy\/?$/.test(location.pathname)) return;
  try {
    const record = {
      token: crypto.randomUUID(),
      href: location.pathname + location.search + location.hash,
      scrollY: window.scrollY
    };
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(record));
    window.history.replaceState({ ...window.history.state, [SOURCE_STATE]: record.token }, "");
    pendingNavigation = record;
  } catch {
    pendingNavigation = null;
  }
}

export function PrivacyPolicyLink({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/privacy") return;
    pendingNavigation = null;
    const record = readReturnLocation();
    if (!record || location.pathname + location.search + location.hash !== record.href) return;
    try {
      if (sessionStorage.getItem(RESTORE_KEY) !== record.token) return;
    } catch {
      return;
    }
    // Restore after the App Router has committed the returning page, including browser Back.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (location.pathname + location.search + location.hash !== record.href) return;
      try {
        if (sessionStorage.getItem(RESTORE_KEY) !== record.token) return;
        window.scrollTo({ top: record.scrollY, behavior: "instant" });
        sessionStorage.removeItem(RESTORE_KEY);
      } catch {
        // Native browser/Next.js restoration remains available when storage is disabled.
      }
    }));
  }, [pathname]);

  return <Link href="/privacy" className={className} data-autozap-privacy-return
    onNavigate={rememberReturnLocation} onClick={(event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        !isAnalyticsResident()) return;
      event.preventDefault();
      rememberReturnLocation();
      try {
        if (pendingNavigation) sessionStorage.setItem(DOCUMENT_KEY, pendingNavigation.token);
      } catch { /* Native history and the existing fallback remain available. */ }
      leaveAnalyticsDocument("/privacy");
    }}>{children}</Link>;
}

export function PrivacyBackLink({ className }: { className?: string }) {
  const router = useRouter();

  useEffect(() => {
    try {
      if (pendingNavigation) {
        window.history.replaceState({ ...window.history.state, [PRIVACY_STATE]: pendingNavigation.token }, "");
        pendingNavigation = null;
      }
    } catch {
      pendingNavigation = null;
    }
    const record = readReturnLocation();
    try {
      const token = sessionStorage.getItem(DOCUMENT_KEY);
      sessionStorage.removeItem(DOCUMENT_KEY);
      if (record && token === record.token && window.history.length > 1 && document.referrer) {
        const referrer = new URL(document.referrer);
        const source = new URL(record.href, location.origin);
        if (referrer.origin === location.origin && referrer.pathname === source.pathname && referrer.search === source.search) {
          window.history.replaceState({ ...window.history.state, [PRIVACY_STATE]: record.token }, "");
        }
      }
    } catch { /* A failed bridge does not authorize traversal of unrelated history. */ }
    if (!record || window.history.state?.[PRIVACY_STATE] !== record.token) return;
    function restoreOnBrowserBack() {
      if (!record || location.pathname + location.search + location.hash !== record.href) return;
      try {
        sessionStorage.setItem(RESTORE_KEY, record.token);
      } catch {
        // Do not change native Back behavior when session storage is unavailable.
      }
    }
    // Capture before Next.js handles the pop and can unmount this component.
    window.addEventListener("popstate", restoreOnBrowserBack, true);
    return () => window.removeEventListener("popstate", restoreOnBrowserBack, true);
  }, []);

  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const record = readReturnLocation();
    // Only this tab's recorded internal transition authorizes traversing browser history.
    if (!record || window.history.state?.[PRIVACY_STATE] !== record.token) return;
    try {
      sessionStorage.setItem(RESTORE_KEY, record.token);
      event.preventDefault();
      router.back();
    } catch {
      router.replace("/#footer");
    }
  }

  return (
    <Link href="/#footer" replace className={className} onClick={goBack}>
      <ChevronLeftIcon width={18} height={18} />
      <span>Назад</span>
    </Link>
  );
}
