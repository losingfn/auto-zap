# Desktop privacy notice and approved consent reader

Status: **PENDING VISUAL AND FUNCTIONAL APPROVAL**. Local implementation only; no commit,
push, PR, merge, deployment, environment changes or production migration.

## Implemented behavior

- At widths of at least 1024px the initial notice is a nonmodal `section`, 1000px maximum
  width, centered horizontally with a 24px bottom inset. It has no backdrop, document scroll
  lock or focus trap. Measured height is about 232px. Text is above the three actions.
- Buttons use the real `customer-reviews-action` / primary / secondary classes. No review
  component or global stylesheet was modified. Rubik, padding, borders, radii, backgrounds,
  hover, focus and active behavior match that existing system. The unavailable positive action
  is disabled, with a dedicated disabled treatment and an explanatory title.
- The desktop close button only writes `autozap.privacy-banner-dismissed.v1` to sessionStorage.
  It does not issue an API request or change local/server choice. Independent tabs show the
  notice if there is no saved decision. Browser restoration/opener cloning can preserve tab
  storage; no absolute destruction promise is made. Blocked sessionStorage permits memory-only
  dismissal in the current application document.
- Below 1024px the previous modal-banner composition is retained, including the existing
  mobile bottom panel below 640px. The missing-document message is replaced by the approved
  text link; this intentional content change can alter the panel's content height. Existing
  mobile colors, padding, typography, action order and two buttons/customize link remain.
- One existing modal controller switches between settings and the consent reader. The reader
  is 850px wide at desktop, at most 85dvh high, with a scrollable semantic document and accessible
  Back/close actions. No new route, URL change, iframe text display or nested modal was created.
- `Прочитать согласие` opens the reader from the banner; `Прочитать полное согласие` opens it
  from settings. Back/Escape return to the recorded source. Reading preserves the settings
  draft/scroll and restores focus to the originating link. Reading/closing never saves consent.
  Settings opened from a hidden notice's Footer trigger do not resurrect the banner on close.

## Approved document and unchanged server protocol

`src/features/privacy/consent-content.ts` contains the supplied document byte for byte.
All ten sections, punctuation, operator details and URLs remain. Version:
`sha256:f801a44356ed08df59a848e25c006cd540e74efcf4a4dd08c50dd29057095d82`.
The renderer adds semantic headings, paragraphs and lists without rewriting their text.
Only supplied URLs are linked; no Yandex privacy-policy URL is invented.

The document gate is now satisfied. Counter ID and verified dashboard settings are still absent,
so acceptance remains disabled and the site's Metrika SDK is not loaded. API, journal, cookie,
twelve-calendar-month expiry, withdrawal, idempotency and synchronization protocols are unchanged.
The UI still uses the existing save mechanism. No PostgreSQL schema changes or migrations ran.

## Files in this task

Runtime changes:

- `src/components/site/privacy-settings.tsx`
- `src/components/site/privacy-settings.module.css`
- `src/features/privacy/privacy-provider.tsx`
- `src/config/privacy.ts`
- New `src/components/site/privacy-consent-document.tsx`
- New `src/features/privacy/consent-content.ts`

Checks/documentation:

- New `scripts/test-privacy-banner.ts`
- Updated `scripts/test-privacy-consent.ts`
- Updated `PRODUCT.md`, `docs/privacy-consent.md`, `docs/privacy-consent-design.md`
- This report and real captures/JSON evidence under `artifacts/privacy-banner-consent/`

The already dirty branch is `codex/privacy-consent`; earlier uncommitted work is preserved.
Frozen source hashes verify that Header, home, search, catalog shell, reviews, map, Footer,
privacy page, global CSS, analytics loader and server/database implementation are unchanged
by this task. The previous desktop Footer control image matches byte for byte.

## Verification and limitations

Passed: `pnpm typecheck`, `pnpm build`, `pnpm test`, privacy domain/API/mock-SDK tests and targeted
ESLint. One scoped Impeccable detector pass returned `[]`. The new browser suite checks desktop
1024/1280/1366/1440/1600/1920/2560 widths, mobile 320/360/375/390/430, tablets 768/820 and short
360px heights. Required screenshots are in the separate artifact folder; previous controls
were not overwritten. Zoom is 100%, device scale factor is 1.

The independent approved attachment matches the stored source byte for byte, and the entire
rendered document matches after normalizing layout whitespace. Browser checks cover source
return, draft/focus, session dismissal, independent tabs, the unchanged mobile composition,
real API outage, disabled acceptance and zero site-document Metrika script requests.
The refusal success/reload check explicitly uses a mock journal acknowledgement; it does not
prove PostgreSQL persistence. The actual outage check observes a real POST response 503 and
the exact settled error inside the settings dialog, switch off, busy ended and usable close.

Two test-harness corrections were needed: remove an injected `__name` helper from a browser
callback, and compare the used Rubik/fallback metrics rather than unused extra fallback fonts.
The initial error capture selected Next.js's route-announcer `role=alert`, so it was corrected
to wait for the exact error inside our dialog. The corrected capture and separate HTTP503
verification replace that invalid evidence. No runtime defect was hidden by these corrections.

Normal interaction runs have no JavaScript/hydration errors or React #418. The intentionally
unavailable registration API returns an expected 503. The earlier one-off #418 from the previous
task was not reproduced here; its historical cause is not claimed fixed.

Remaining release work: existing counter ID and confirmed settings; real isolated PostgreSQL
transaction/persistence/race checks; journal retention decision; actual Safari/iOS/Android
hardware testing. The previous map single-finger-scroll issue is explicitly outside this task
and unchanged. This UI work does not establish legal compliance or production readiness.

Skills applied: ui-ux-pro-max (focus/source/draft UX), design-taste-frontend (pinned composition,
spacing and button reuse), high-end-visual-design (coherence checks within the pinned system),
minimalist-ui (compactness and no extra decoration), Impeccable (final independent audit and
scoped documentation). The user's fonts, legal punctuation and approved review-button gradients
take precedence over generic skill defaults.

Final review evidence: `artifacts/privacy-banner-consent/finish-review.md`.
