"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "@/components/icons/lucide";
import { analyticsPresentation } from "@/features/privacy/analytics-presentation";
import { PrivacyPolicyLink } from "./privacy-navigation";
import type { getPrivacyConfiguration } from "@/config/privacy";
import styles from "./privacy-settings.module.css";

type Props = {
  modal: "banner" | "settings" | null; draft: boolean; setDraft: (value: boolean) => void;
  busy: boolean; message: string; registeredGrant: boolean;
  configuration: ReturnType<typeof getPrivacyConfiguration>;
  openSettings: () => void; closeSettings: () => void; save: (grant: boolean) => Promise<void>;
};

/** Operate: extend the approved /privacy typography and navy surfaces; no changes to frozen pages. */
export function PrivacySettingsDialog(props: Props) {
  const { modal, draft, setDraft, busy, message, registeredGrant, configuration, openSettings, closeSettings, save } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previousView = useRef<Props["modal"]>(null);
  const banner = modal === "banner";
  const latestClose = useRef(closeSettings);
  latestClose.current = closeSettings;
  const latestBusy = useRef(busy);
  latestBusy.current = busy;
  const isModal = modal !== null && !banner;
  useEffect(() => {
    if (!isModal || !dialog.current) return;
    const target = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.documentElement.style.overflow;
    const oldPadding = document.documentElement.style.paddingRight;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = "hidden";
    if (gutter > 0) document.documentElement.style.paddingRight = `${gutter}px`;
    target.showModal();
    return () => {
      target.close();
      document.documentElement.style.overflow = oldOverflow;
      document.documentElement.style.paddingRight = oldPadding;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [isModal]);
  useEffect(() => {
    const previous = previousView.current;
    previousView.current = modal;
    const root = banner ? panel.current : dialog.current;
    if (!modal || !root) return;
    if (content.current) content.current.scrollTop = 0;
    if (previous === "settings" && banner) {
      root.querySelector<HTMLElement>("[data-privacy-settings]")?.focus({ preventScroll: true });
    } else if (isModal) {
      root.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    }
  }, [modal, banner, isModal]);
  if (!modal) return null;
  const available = configuration.analyticsReady;
  const presentation = analyticsPresentation(registeredGrant, draft, available);
  const consentLink = configuration.document ? (
    <a className={styles.documentLink} href="/privacy/analytics-consent" target="_blank" rel="noopener noreferrer" data-autozap-privacy-control
      onClick={(event) => { if (busy) event.preventDefault(); }}>Прочитать полное согласие</a>
  ) : null;
  const body = <>
      {!banner ? <button type="button" className={styles.close}
        onClick={closeSettings} disabled={busy}
        aria-label="Закрыть настройки без сохранения"><XIcon width={20} height={20} /></button> : null}
      <div ref={content} className={styles.content}>
      <h2 id="privacy-dialog-title" tabIndex={-1} data-initial-focus className={styles.title}>{banner ? "Мы используем cookies и Яндекс.Метрику" : "Настройки конфиденциальности"}</h2>
      <p id="privacy-dialog-description" className={styles.description}>
        {banner ? <>Нажимая «Принять», вы даёте отдельное согласие на обработку персональных данных Яндекс.Метрикой для статистики посещаемости. Полный текст: «Настроить» → «Прочитать полное согласие». Отказ отключает аналитику; Яндекс-Карта работает независимо. Подробнее о cookie — в <PrivacyPolicyLink className={styles.policyLink}>Политике обработки персональных данных</PrivacyPolicyLink>.</>
          : "Здесь вы можете управлять использованием аналитики."}
      </p>
      {!banner ? <div className={styles.sections}>
        <section className={`${styles.section} ${styles.analytics}`} aria-labelledby="privacy-analytics-title">
          <h3 id="privacy-analytics-title">Аналитические cookie и Яндекс.Метрика</h3>
          <p>Помогают получать статистику посещаемости и улучшать работу сайта. Используются только с вашего согласия. {consentLink}</p>
          <label className={styles.toggleRow}><span>Разрешить аналитику</span>
            <input type="checkbox" role="switch" checked={presentation.checked} disabled={busy || !available} aria-describedby="privacy-analytics-state" onChange={(event) => setDraft(event.target.checked)} />
            <span className={styles.switch} aria-hidden="true" />
          </label>
          <p id="privacy-analytics-state" className={styles.savedState} data-state={presentation.state} role="status">{presentation.text}</p>
        </section>
      </div> : null}
      </div>
      {message ? <p className={`${styles.feedback} ${styles.error}`} role="alert">{message}</p> : null}
      {banner ? <div className={styles.bannerActions}>
        <button type="button" className="customer-reviews-action customer-reviews-action-primary tap-target"
          disabled={busy || !available} title={!available ? "Включение аналитики временно недоступно" : undefined}
          onClick={() => { void save(true); }}>Принять</button>
        <button type="button" className="customer-reviews-action customer-reviews-action-secondary tap-target"
          disabled={busy} onClick={() => { void save(false); }}>Только необходимые</button>
        <button type="button" className="customer-reviews-action customer-reviews-action-secondary tap-target"
          data-privacy-settings disabled={busy} onClick={openSettings}>Настроить</button>
      </div> : <div className={styles.settingsActions}>
        <button type="button" className="customer-reviews-action customer-reviews-action-primary tap-target" disabled={busy}
          onClick={() => { void save(presentation.checked); }}>{busy ? "Сохраняем…" : "Сохранить настройки"}</button>
      </div>}
    </>;
  return createPortal(banner ? <section ref={panel} role="region" className={`${styles.dialog} ${styles.banner}`}
    aria-labelledby="privacy-dialog-title" aria-describedby="privacy-dialog-description" data-privacy-banner>{body}</section> :
    <dialog ref={dialog} className={`${styles.dialog} ${styles.settings}`}
      aria-labelledby="privacy-dialog-title" aria-describedby="privacy-dialog-description"
      onCancel={(event) => { event.preventDefault(); if (!banner && !latestBusy.current) latestClose.current(); }}>{body}</dialog>, document.body);
}
