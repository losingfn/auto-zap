"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheckIcon } from "@/components/icons/lucide";
import styles from "./privacy-saved-notice.module.css";

/** A CSS glass interpretation for the web; only the existing provider's confirmed explicit save mounts it. */
export function PrivacySavedNotice({ onDismiss }: { onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), 2500);
    const remove = window.setTimeout(() => dismiss.current(), 2680);
    return () => { window.clearTimeout(fade); window.clearTimeout(remove); };
  }, []);
  return createPortal(<div className={`${styles.notice} ${leaving ? styles.leaving : ""}`}
    role="status" aria-live="polite" aria-atomic="true" data-privacy-saved-notice>
    <CircleCheckIcon width={20} height={20} />
    <span>Настройки сохранены</span>
  </div>, document.body);
}
