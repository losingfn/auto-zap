# Privacy consent — approved controls and separate document page

The implementation extends the approved privacy-page navy, typography and footer. Frozen Header,
footer CSS, privacy page/content and existing catalog/business behavior are preserved.
The initial banner, settings dialog and Liquid Glass saved notice are approved and frozen.
The new `/privacy/analytics-consent` page awaits owner visual review; the fresh narrow finish
review returned `ship` with no material fixes and does not authorize publication.

## Publication blockers

- The owner supplied the approved ten-section analytics consent document on 2026-10-14.
  `src/features/privacy/consent-content.ts` stores it verbatim, versioned by the SHA-256 of the
  supplied file. The page-only renderer displays it on `/privacy/analytics-consent`; the unchanged
  settings link opens it in a new tab with `noopener noreferrer`. The old document modal is removed.
  The document-availability gate is satisfied; counter readiness and
  successful server registration remain mandatory. Accept buttons stay disabled until ready.
- The existing Metrika ID and verified dashboard settings are not supplied. No new counter is
  created. `YANDEX_METRIKA_COUNTER_ID` and `YANDEX_METRIKA_CONFIGURATION_VERIFIED=true` must only
  be configured after the owner confirms restricted mode, IP masking, and disabled advertising,
  automatic goals, Webvisor, scroll/click/form maps, tag manager and extra visitor collection.
  These dashboard settings cannot be enabled or verified through the local init options alone.
- Local PostgreSQL/Docker is unavailable. Transaction, migration and contention behavior must
  be verified on an isolated real PostgreSQL database before publication. No production migration ran.
- The restored external iframe intercepts single-finger page scrolling in the final Chromium
  mobile touch test. A control gesture outside the iframe scrolls normally; setting `touch-action`
  on the iframe did not solve it. Earlier fast synthetic gestures produced inconsistent results.
  The map test now fails explicitly for this release blocker. Resolve gesture control with a
  verified integration before release, and then test real devices. No invisible activation
  layer or new map controls were introduced to bypass the approved UI restrictions.
- Journal retention/deletion after expiry or withdrawal has no final approved period. No automatic
  cleanup policy or claim about a legal retention period is implemented.

## Server deployment preparation (do not run automatically)

1. Review/apply the additive, repeat-safe `db/migrations/0012_privacy_consent.sql` through the
   project's migration workflow, with its normal backup/release procedure. This document does
   not authorize deployment or infrastructure changes.
2. Supply a dedicated random `PRIVACY_CONSENT_SECRET` of at least 32 characters and correct
   canonical `APP_URL`. Never reuse the admin session secret. Secret changes invalidate old
   browser receipts; local saved grants alone cannot reactivate analytics.
3. Review pool budgets/DB permissions and edge rate limiting for the deployment. The module
   uses a separate max-2 pool, 2s statement timeout, 500ms lock timeout and a max-2 in-flight
   limit. In-memory request limits apply per process and are not distributed protection.
4. Supply the verified existing counter configuration; test actual vendor
   requests on every allowed/forbidden route and browser before removing the publication gates.

## Consent lifecycle

- No cookie is issued merely by visiting. An explicit saving action prepares a random signed
  receipt. `autozap_privacy_receipt` is HttpOnly, Secure in production, SameSite=Strict, scoped
  to `/api/privacy-consent`, with a twelve-calendar-month expiry. The DB stores its SHA-256 hash.
- The append-only journal stores an operation UUID, receipt hash, grant/decline/revoke kind,
  approved document version for grants, server timestamp and expiry. No IP, UA, search query,
  purchase list, Metrika ClientID or admin identity is journalled.
- Advisory transaction locks serialize each receipt, including the first event. A withdrawal
  tombstones a delayed grant. Unique receipt/kind and operation constraints suppress repeats.
  Successful acknowledgement follows COMMIT, never a fallback or a timed-out query.
- UTC calendar expiry clamps February 29. Database expiry uses calendar `INTERVAL '12 months'`
  bounded by cookie expiry; neither visits nor status requests extend a grant.
- `autozap.privacy-choice.v1` stores the local choice, expiry, receipt hash and document version.
  A pending decline/revoke has one operation ID. A locally stored grant must match a current
  server receipt/version before the controller enables analytics.
- Withdrawal stops analytics locally before any request. “Только необходимые” from the initial
  banner also persists the local refusal and closes the banner before network work. Failed
  banner refusal retains the pending local outbox without an error modal or success notice.
  Failed explicit settings saves keep the modal open with a readable error above the sole Save
  action; retry and reopening clear the old error. Retries are bounded to three per document,
  restart on an online event, and remain manually retryable. Pending grants are never auto-retried
  after a visit. Clearing storage/cookies, closing an offline browser, or a cookie overwritten by
  a concurrent tab can prevent later journal delivery; local shutdown does not prove server receipt.
- The initial notice is a nonmodal bottom panel at all widths, with no X, backdrop or document
  scroll lock. It has an inline /privacy policy link and three real reviews-style buttons:
  “Принять”, “Только необходимые”, “Настроить”. The full-consent link exists only in settings.
  Only the obsolete `autozap.privacy-banner-dismissed.v1` session key is removed; unrelated
  navigation/return storage remains untouched. Unavailable analytics disables Accept and the
  switch and displays “Включение аналитики временно недоступно”.
- “Прочитать полное согласие” retains its settings position and styling and opens
  `/privacy/analytics-consent` with `target="_blank"` and `rel="noopener noreferrer"`.
  The source dialog, switch, saved choice and scroll position remain intact. Reading sends
  no consent POST and does not enable analytics. Direct entry and reload work independently
  of settings. The page reuses existing Header/Footer and policy CSS with ordinary browser
  scrolling, one h1, ten h2 sections and the original literal list numbering. The original
  text/version is unchanged: `sha256:f801a44356ed08df59a848e25c006cd540e74efcf4a4dd08c50dd29057095d82`.
- Settings retain the three categories and one switch. Their badge distinguishes saved on/off
  from a draft that will be enabled/disabled after saving. One centered “Сохранить настройки”
  action is 240px on desktop and full width on mobile. Valid explicit settings acknowledgement
  closes the dialog and shows the polite, noninteractive “Настройки сохранены” glass notice
  for 2500ms plus a 180ms exit. Failed saves, banner actions, automatic outbox acknowledgement
  and reload do not create it. Reduced motion disables its movement; route changes clear it
  and clean up dialog/error state. Closing without saving retains the prior saved choice;
  a first visit returns to the banner.
- `storage` events synchronize tabs; visibility/pageshow recheck a grant; expiry timers handle
  the browser's maximum timeout. Storage failure keeps analytics disabled. Purchase-list and
  navigation keys are untouched.

## Analytics isolation

The prepared loader is gated off. When authorized in a future verified release, it only permits
the actual `/`, `/catalog`, category and subcategory routes, without queries or user fragments; product detail,
search, list, privacy, admin and unknown routes are excluded. Sensitive referrers also block it.
An invisible attribute on the existing home/catalog main element verifies the actual rendered
surface; a missing category/404 cannot activate the SDK merely by matching a URL pattern.
The home's fixed section anchors remain normal approved navigation; explicit hits still omit hashes.
Initialization defers automatic hits, disables optional features/YTM, and explicit page hits use
query-free URLs, an empty referrer and fixed title. No custom events/user parameters are sent.

Opening settings stops the counter; a sensitive link/search transition leaves the SDK document.
Back/pagehide and late callbacks are fenced. Withdrawal calls official `destruct`, clears pending
own calls, removes the owned script and counter-scoped localStorage timing/request entries.
An SDK cannot be fully unloaded by removing its element, and already issued requests/statistics
cannot be recalled. No absolute guarantee about opaque vendor telemetry is claimed. Actual
external-service behavior remains untested until the approved existing counter can be enabled.
The existing privacy return helper bridges a full-document transition with a one-use session token,
validated against the same-origin source referrer and history. This preserves policy return/scroll
when an SDK-hosting document must be left; ordinary navigation retains its previous behavior.

## Map

The existing component/styles/location/coordinates/actions are preserved. Loading starts
automatically near the map (400px margin), regardless of analytics choice or journal failures.
The original JS API path is retained if a key is supplied; otherwise the original interactive
iframe is used. API and iframe timeouts have a bounded external-link fallback. An iframe load
event cannot establish that every internal tile/request succeeded. Yandex may run its own
telemetry inside the map; this is separate from the site's disabled Metrika counter.
The iframe uses an origin-only cross-origin referrer instead of transmitting the page's query.
Own-counter shutdown does not clear unrelated services' global SDK queues.

### Iframe history and proposed gesture protection

History was inspected after the owner's clarification:

- `4754524` already contains both the optional JS API path and the no-key
  `MapEmbed` iframe using `https://yandex.ru/map-widget/v1/`.
- `55bf6aa`, `6cf2887` and `e9ed988` retain those integration paths; changes concern route
  links/mobile controls. `5e5b7eb` on `codex/disable-yandex-metrika` disables embedding through
  `YANDEX_MAP_EMBED_ENABLED=false` and renders the external link. It does not remove the iframe.
- `src/app/page.tsx` supplies optional `env.YANDEX_MAPS_API_KEY`; `.env.example` has an empty
  example, and the local environment has no non-empty key. Historic production environment
  values are not established by Git history. No production configuration was inspected/changed.

Browser-only research on the current local build confirms that adding `scroll=false` or
`touch-action:pan-y` to the existing iframe does not fix the single-finger page scroll.
The same gesture outside the map scrolls the page. No undocumented gesture parameter is
treated as a supported solution; cross-origin iframe events cannot simply be rewritten by
the site's JavaScript.

A transparent, touch-only interaction guard was prototyped in an isolated browser, without
editing the application's source, changing the iframe URL, or loading a Maps API/Metrika SDK
in the site's document. Initially a swipe over the map scrolls the page; a tap activates the
iframe; a tap outside deactivates it. After activation, the iframe handles map gestures as
usual. This deliberately adds one tap before interacting with the map and does not promise
simultaneous single-finger map dragging and page scrolling. Desktop behavior is unchanged.

At 390 and 768px the prototype passed page-scroll checks before activation and after outside
tap, real zoom by touch and mouse pan after activation. At 1440px the guard was absent and the
map remained interactive. The iframe bounds and before/after pixels matched at all three
widths. These are Chromium/touch-emulation results, not Safari or physical-device verification.
An actual implementation would also require keyboard/focus handling and listener cleanup.
The proposal has NOT been applied to application source: the current map-scroll release
blocker and failing regression test remain. JavaScript API is not established as necessary,
and no new API key is requested. Evidence: `artifacts/privacy-consent/map-iframe-research/research.json`.

References: [official iframe embedding](https://yandex.ru/support/maps/ru/concept/get-map-reference),
[cross-origin restrictions](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy).

## Checks

- `node --import tsx scripts/test-privacy-consent.ts`: domain/API guards, DB outage and a mocked
  SDK including delayed callbacks, duplicate init and sanitized hits. Does not prove a real DB or SDK.
- `node --import tsx scripts/test-privacy-browser.ts`: isolated Chrome at 10 widths and short heights,
  real local UI/API failure/screenshots, explicitly mocked journal success, real external map,
  footer preservation, policy return and own-Metrika network checks. The full-document return uses
  a synthetic SDK-transition session fixture without loading Metrika; navigation itself is real.
  Artifacts include `checks.json`.
- The above browser script and `scripts/test-privacy-banner.ts` record earlier banner stages;
  `artifacts/privacy-banner-consent/` is historical evidence. For the current all-width nonmodal
  banner, settings and saved notice, use `scripts/test-privacy-controls.ts`,
  `scripts/test-privacy-controls-browser.ts`, `scripts/test-privacy-controls-keyboard.ts` and
  `artifacts/privacy-controls/report.json` with its captures. The current browser report records
  actual negative POST 503 responses, no JavaScript page errors and zero own Metrika SDK requests.
  Successful negative ACKs are explicitly mocked, while on/pending states and toast captures in
  `artifacts/privacy-controls/visual-mocks/` are watermarked visual evidence, not real DB success
  or positive-grant verification. Counter settings remain absent; physical Safari/iOS/Android
  behavior remains unverified. The narrow controls finish review returned `ship` with no material
  fixes at that UI scope. Those widgets are now owner-approved; publication blockers remain outstanding.
- `node --import tsx scripts/test-privacy-map-browser.ts`: direct desktop/tablet/touch-browser map
  loading, real external zoom/pan, screenshots and a delayed-request fallback scenario; fails on
  the unresolved mobile single-finger scroll requirement rather than treating it as a pass.
- `pnpm typecheck`, targeted ESLint, `pnpm test`, purchase-list/navigation tests and `pnpm build`.
- The separate page pass is recorded in `docs/privacy-analytics-consent-page.md` and
  `artifacts/privacy-analytics-consent-page/`. `scripts/test-analytics-consent-page.ts` passed
  all eight requested sizes: direct URL/reload, source-text identity, ten sections, no horizontal
  overflow, Header/Footer, keyboard scrolling, Click/Enter new-tab opening and preserved source
  settings with no reading POST. Pixel preservation is recorded in `visual-preservation.json`.
  Controls browser regression passed eight scenarios at ten widths with zero JavaScript page
  errors and zero own SDK requests; keyboard regression passed with an explicitly mocked
  negative ACK. `pnpm typecheck`, `pnpm build`, `pnpm test` and targeted ESLint passed for that
  implementation. PostgreSQL success, positive consent and physical devices were not verified.

Safari/iOS/Android hardware testing, real journal races/permissions and actual counter behavior
remain release checks. The separate document page awaits owner visual review; the earlier
banner, settings and saved-notice approvals remain in force.
An initial browser run reported React hydration error #418 once. It was not reproduced in the
subsequent successful full run or focused checks; its cause is not established or claimed fixed.

## Task file scope

New runtime files:

- `src/app/privacy/analytics-consent/page.tsx`, `src/components/site/privacy-consent-document.module.css`
  (separate document-page pass).
- `src/config/privacy.ts`
- `src/features/privacy/domain.ts`, `receipt.ts`, `repository.ts`, `analytics.ts`, `privacy-provider.tsx`
- `src/app/api/privacy-consent/route.ts`
- `src/components/site/privacy-settings.tsx`, `privacy-settings.module.css`
- `db/migrations/0012_privacy_consent.sql`

Existing runtime files extended:

- `src/app/layout.tsx`: global provider.
- `src/app/page.tsx`, `src/components/catalog/page-shell.tsx`: invisible allowed-surface marker.
- `src/components/home/home-search.tsx`: leave an SDK-hosting document before a sensitive search.
- `src/components/home/yandex-map.tsx`: restore near-viewport loading and bounded fallback.
- `src/components/site/public-footer.tsx`: existing settings row now opens the settings dialog.
- `src/components/site/privacy-navigation.tsx`: one-use full-document return bridge; appearance unchanged.
- `src/db/schema.ts`: additive journal table definition.
- Separate document-page pass: `src/components/site/privacy-consent-document.tsx` now renders
  the existing source only on the page; `privacy-settings.tsx`, its CSS and
  `privacy-provider.tsx` remove the obsolete document-modal branch and use the new-tab link.
  Approved controls geometry and save behavior are preserved.

New supporting files: `scripts/test-privacy-consent.ts`, `scripts/test-privacy-browser.ts`,
`scripts/test-privacy-map-browser.ts`, `PRODUCT.md`, this document and `docs/privacy-consent-design.md`.
Real captures and JSON reports are under `artifacts/privacy-consent/`.
Previously uncommitted Header, home, footer, privacy-page and asset work is preserved separately
from these changes; the final Git diff includes that earlier work. Frozen source hashes are
recorded in `frozen-checks.json`; the navigation helper is the documented technical exception.

Official references: [initialization](https://yandex.ru/support/metrica/ru/code/counter-initialize),
[SPA destruct](https://yandex.ru/support/metrica/ru/code/counter-spa-setup),
[IP masking](https://yandex.ru/support/metrica/ru/general/ip-masking),
[counter settings](https://yandex.ru/support/metrica/ru/general/counter-general).
