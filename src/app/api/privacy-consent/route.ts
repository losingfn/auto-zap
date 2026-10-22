import { createPrivacyConsentHandlers } from "@/features/privacy/endpoint";
import { getRegisteredConsent, registerConsentEvent } from "@/features/privacy/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = createPrivacyConsentHandlers({ getRegisteredConsent, registerConsentEvent });
