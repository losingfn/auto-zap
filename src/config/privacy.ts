import { analyticsConsentVersion } from "@/features/privacy/consent-content";

/** Publication gates: only the approved document and verified existing counter may unlock analytics. */
export type ApprovedAnalyticsConsent = {
  version: string;
};

// The full ten-section document is available at /privacy/analytics-consent.
export const approvedAnalyticsConsent: ApprovedAnalyticsConsent = { version: analyticsConsentVersion };

export function getPrivacyConfiguration() {
  const rawId = process.env.YANDEX_METRIKA_COUNTER_ID;
  const counterId = rawId && /^[1-9]\d*$/.test(rawId) && Number.isSafeInteger(Number(rawId))
    ? Number(rawId) : null;
  const counterVerified = process.env.YANDEX_METRIKA_CONFIGURATION_VERIFIED === "true";
  const receiptSigningReady = process.env.NODE_ENV !== "production" ||
    Boolean(process.env.PRIVACY_CONSENT_SECRET && process.env.PRIVACY_CONSENT_SECRET.length >= 32);
  return {
    document: approvedAnalyticsConsent,
    counterId,
    analyticsReady: Boolean(approvedAnalyticsConsent && counterId && counterVerified && receiptSigningReady)
  };
}
