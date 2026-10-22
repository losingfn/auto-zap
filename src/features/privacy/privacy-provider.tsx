"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { getPrivacyConfiguration } from "@/config/privacy";
import { PrivacySettingsDialog } from "@/components/site/privacy-settings";
import { PrivacySavedNotice } from "@/components/site/privacy-saved-notice";
import {
  PRIVACY_API_PATH, PRIVACY_STORAGE_KEY, hasRegisteredGrant, isAnalyticsLocationAllowed,
  unknownConsent, type PrivacyChoice, type RegisteredConsent
} from "./domain";
import { isAnalyticsResident, leaveAnalyticsDocument, observeAnalyticsRoute, stopAnalytics, updateAnalytics, withdrawAnalytics } from "./analytics";
import { PRIVACY_INTENT_KEY, PRIVACY_LOCK, PRIVACY_OPERATION_PREFIX, PrivacyCoordinator, PrivacyRequestError } from "./coordinator";

type Configuration = ReturnType<typeof getPrivacyConfiguration>;
type Modal = "banner" | "settings" | null;
const PrivacyContext = createContext<{ openSettings: () => void } | null>(null);

async function request<T>(body?: unknown, receiptId?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(PRIVACY_API_PATH, {
      method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : receiptId ? { headers: { "X-Privacy-Receipt": receiptId } } : {}),
      signal: controller.signal
    });
    const value = await response.json();
    if (!response.ok) throw new PrivacyRequestError(response.status, typeof value?.code === "string" ? value.code : "");
    return value as T;
  } finally { window.clearTimeout(timeout); }
}

export function PrivacyProvider({ configuration, children }: { configuration: Configuration; children: ReactNode }) {
  const pathname = usePathname();
  const [choice, setChoice] = useState<PrivacyChoice | null>(null);
  const [registered, setRegistered] = useState<RegisteredConsent>(unknownConsent);
  const [hydrated, setHydrated] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState(false);
  const draftTouched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<number | null>(null);
  const noticeSequence = useRef(0);
  const previousPath = useRef(pathname);
  const actual = useRef({ choice, registered, modal });
  actual.current = { choice, registered, modal };
  const saving = useRef(false);
  const coordinator = useRef<PrivacyCoordinator | null>(null);
  const legalPage = pathname.startsWith("/admin");
  const version = configuration.document?.version ?? null;
  const authorized = useCallback(() => document.visibilityState === "visible" &&
    actual.current.modal === null && Boolean(coordinator.current?.isAuthorized()), []);

  useEffect(() => {
    // Retire only the old X dismissal key. Navigation/return storage is untouched.
    try { sessionStorage.removeItem("autozap.privacy-banner-dismissed.v1"); } catch { /* An unread legacy value cannot suppress the new notice. */ }
  }, []);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setNotice(null); setMessage("");
    if (actual.current.modal !== "banner" || legalPage) {
      const next = !actual.current.choice && !legalPage ? "banner" : null;
      actual.current.modal = next; setModal(next);
    }
  }, [pathname, legalPage]);

  const synchronize = useCallback(async () => { await coordinator.current?.synchronize(); }, []);

  useEffect(() => {
    const manager = window.navigator.locks;
    const controller = new PrivacyCoordinator({
      storage: {
        get length() { return window.localStorage.length; },
        key: (index) => window.localStorage.key(index), getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
        removeItem: (key) => window.localStorage.removeItem(key), clear: () => window.localStorage.clear()
      }, now: Date.now, id: () => crypto.randomUUID(), stop: stopAnalytics, request,
      lock: manager ? async <T,>(work: () => Promise<T>) => {
        const abort = new AbortController();
        const timer = window.setTimeout(() => abort.abort(), 7000);
        try { return await manager.request(PRIVACY_LOCK, { signal: abort.signal }, work); }
        finally { window.clearTimeout(timer); }
      } : undefined,
      changed: (snapshot) => {
        // Synchronous and independent of the journal response, including another tab's refusal.
        if (snapshot.choice?.decision === "declined") withdrawAnalytics(configuration.counterId);
        actual.current.choice = snapshot.choice; actual.current.registered = snapshot.registered;
        saving.current = snapshot.busy;
        setChoice(snapshot.choice); setRegistered(snapshot.registered); setHydrated(snapshot.hydrated);
        setBusy(snapshot.busy); setMessage(snapshot.message);
        if (!draftTouched.current) setDraft(configuration.analyticsReady &&
          hasRegisteredGrant(snapshot.choice, snapshot.registered, version));
      }
    }, version, configuration.analyticsReady);
    coordinator.current = controller;
    void controller.synchronize();
    function storage(event: StorageEvent) {
      if (event.key !== null && event.key !== PRIVACY_STORAGE_KEY && event.key !== PRIVACY_INTENT_KEY &&
        !event.key.startsWith(PRIVACY_OPERATION_PREFIX)) return;
      setNotice(null);
      void controller.synchronize();
    }
    function resume() {
      if (document.visibilityState === "visible") { void controller.synchronize(); void controller.retry(); }
      else controller.suspend();
    }
    const hide = () => controller.suspend();
    const online = () => { void controller.retry(true); };
    const timer = window.setInterval(() => { if (window.navigator.onLine) void controller.retry(); }, 15_000);
    window.addEventListener("storage", storage);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", hide);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", resume);
    // Reconcile a previous tab's interrupted operation after acquiring the same browser-wide lock.
    void controller.retry();
    return () => {
      controller.dispose();
      window.clearInterval(timer);
      window.removeEventListener("storage", storage);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [version, configuration.analyticsReady]);

  useEffect(() => {
    if (hydrated && !legalPage && !choice && !saving.current) {
      setModal((value) => value ?? "banner");
    } else if (choice || legalPage) {
      setModal((value) => value === "banner" ? null : value);
    }
  }, [hydrated, legalPage, choice]);

  useEffect(() => {
    if (!choice) return;
    // Long grants exceed the browser timer limit; re-arm until the actual calendar deadline.
    const remaining = choice.expiresAt - Date.now();
    const timer = window.setTimeout(() => { void synchronize(); }, Math.max(0, Math.min(remaining, 2_147_483_647)));
    return () => window.clearTimeout(timer);
  }, [choice, synchronize]);

  useEffect(() => {
    observeAnalyticsRoute();
    if (modal !== null || !authorized()) { stopAnalytics(); return; }
    void updateAnalytics(configuration.counterId, configuration.analyticsReady, authorized, registered.receiptId ?? "");
  }, [pathname, choice, registered, modal, configuration, authorized]);

  useEffect(() => {
    function click(event: MouseEvent) {
      if (!isAnalyticsResident() || event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self")) return;
      // The policy link records its return location before leaving an SDK-hosting document.
      if (anchor.hasAttribute("data-autozap-privacy-return") || anchor.hasAttribute("data-autozap-privacy-control")) return;
      const target = new URL(anchor.href, location.origin);
      if (target.origin === location.origin && !isAnalyticsLocationAllowed(target)) {
        event.preventDefault();
        event.stopPropagation();
        leaveAnalyticsDocument(target.href);
      }
    }
    function back() {
      if (isAnalyticsResident() && !isAnalyticsLocationAllowed(new URL(location.href))) {
        stopAnalytics();
        window.location.reload();
      }
    }
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", back, true);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("popstate", back, true); };
  }, []);

  const openSettings = useCallback(() => {
    stopAnalytics();
    draftTouched.current = false;
    setDraft(configuration.analyticsReady && hasRegisteredGrant(actual.current.choice, actual.current.registered, version));
    coordinator.current?.clearMessage(); setNotice(null);
    actual.current.modal = "settings";
    setModal("settings");
  }, [version, configuration.analyticsReady]);

  function closeSettings() {
    if (saving.current) return;
    coordinator.current?.clearMessage();
    const next = !actual.current.choice && !legalPage ? "banner" : null;
    actual.current.modal = next; setModal(next);
  }

  async function save(grant: boolean) {
    const controller = coordinator.current;
    if (!controller || saving.current) return;
    const fromBanner = actual.current.modal === "banner";
    const sourcePath = window.location.pathname;
    if (!grant) withdrawAnalytics(configuration.counterId);
    setNotice(null);
    if (!grant && fromBanner) { actual.current.modal = null; setModal(null); }
    const saved = await controller.save(grant);
    if (saved) setDraft(grant);
    if (!saved && fromBanner && controller.snapshot.message && sourcePath === window.location.pathname) {
      // Reuse the existing error slot: a local refusal must not look like confirmed server registration.
      actual.current.modal = "banner"; setModal("banner");
    }
    if (!saved || sourcePath !== window.location.pathname) return;
    if (!fromBanner && actual.current.modal === "settings") {
      actual.current.modal = null; setModal(null); setNotice(++noticeSequence.current);
    } else if (fromBanner && actual.current.modal === "banner") {
      actual.current.modal = null; setModal(null);
    }
  }

  return (
    <PrivacyContext.Provider value={{ openSettings }}>
      {children}
      <PrivacySettingsDialog
        modal={modal} draft={draft} setDraft={(value) => { draftTouched.current = true; setDraft(configuration.analyticsReady && value); }} busy={busy} message={message}
        registeredGrant={hasRegisteredGrant(choice, registered, version)} configuration={configuration}
        openSettings={openSettings} closeSettings={closeSettings} save={save}
      />
      {notice !== null ? <PrivacySavedNotice key={notice} onDismiss={() => setNotice((value) => value === notice ? null : value)} /> : null}
    </PrivacyContext.Provider>
  );
}

export function PrivacySettingsTrigger({ children, className }: { children: ReactNode; className?: string }) {
  const context = useContext(PrivacyContext);
  return <a href="#privacy-settings" data-autozap-privacy-control className={className} onClick={(event) => {
    event.preventDefault(); context?.openSettings();
  }}>{children}</a>;
}
