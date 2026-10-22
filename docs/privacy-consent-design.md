---
name: auto-zap privacy controls
description: Scoped record of the approved privacy controls and separate consent document page.
colors:
  main-navy: "#071a2e"
  inset-navy: "#10273d"
  body: "#e5e7eb"
  supporting: "#bdcddb"
  link: "#a7d0ee"
  link-hover: "#c9e7fb"
  notice-text: "#f5faff"
  quiet: "#adc4d6"
  success: "#b8e5cc"
  error: "#fecaca"
typography:
  body:
    fontFamily: "var(--font-golos-text), Arial, sans-serif"
    fontSize: "16px"
    lineHeight: 1.6
  action:
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "26px"
rounded:
  surface: "20px"
  inset: "12px"
  action: "15px"
  badge: "999px"
components:
  surface:
    backgroundColor: "{colors.main-navy}"
    textColor: "{colors.body}"
    rounded: "{rounded.surface}"
  analytics-inset:
    backgroundColor: "{colors.inset-navy}"
    textColor: "{colors.supporting}"
    rounded: "{rounded.inset}"
  action-primary:
    backgroundColor: "linear-gradient(180deg, #255d88, #1d4b72)"
    textColor: "{colors.notice-text}"
    rounded: "{rounded.action}"
    padding: "13px 26px"
---

# Privacy notice, settings and consent document page: implemented surface

## Overview

This scoped Impeccable record was refreshed on 2026-10-17 for the separate consent page, using `src/app/privacy/analytics-consent/page.tsx`, `privacy-consent-document.tsx`, the existing policy CSS, `privacy-settings.tsx`, `privacy-provider.tsx` and `artifacts/privacy-analytics-consent-page/`. The prior controls record uses `privacy-settings.tsx` and CSS, `privacy-saved-notice.tsx` and CSS, `analytics-presentation.ts`, and `artifacts/privacy-controls/report.json`. The current owner brief, approved navy/font inheritance and actual reviews-button styles are the authority. The previous banner specification and captures describe historical work. No root design system or sidecar is created by this scoped documentation pass.

The initial notice is a nonmodal bottom panel at every width. Settings use the existing native modal; the unchanged ten-section consent document now lives on `/privacy/analytics-consent`, opened in a new tab from the same settings link. The notice introduces the choice; settings explain the categories and separate a draft from saved permission; the small glass notice confirms only an acknowledged explicit settings save. Header, Footer, catalog, reviews, vacancies, contacts, `/privacy`, provider API, core journal, database and configuration remain outside this UI change. The earlier controls comparison recorded 21 unchanged hashes; current preservation evidence is in `artifacts/privacy-analytics-consent-page/visual-preservation.json` and `scope-verification.json`.

**Status: existing banner, settings and saved notice are approved and frozen; the new document page awaits owner visual review.** The fresh page finish reviewer returned disposition `ship` with no material fixes; the first-stage controls reviewer also returned `ship` at its earlier scope. These narrow reviews do not establish owner approval of the new page, legal completeness, production readiness or permission to commit, push, open a PR or deploy. The existing counter ID and verified settings remain absent; positive consent and own Metrika SDK loading remain disabled. PostgreSQL persistence is unavailable locally and journal retention is unresolved.

## Colors

The main and inset navy surfaces inherit the approved privacy world. Headings use `#f3f4f6` / `#f0f4f8`; borders and dividers use `rgba(137, 164, 188, 0.24)` / `rgba(137, 164, 188, 0.2)`. Supporting text and pale blue underlined links maintain hierarchy without a new accent palette. Close hover uses `#152d43`; scrollbars use `#526b83` over the main navy.

All three banner actions and the sole settings Save use the real reviews primary/secondary and tap-target classes at every width. The primary hover is `linear-gradient(180deg, #2e6e9e, #21557e)`; secondary rests at `rgba(19, 39, 59, 0.38)` and hovers at `rgba(30, 58, 81, 0.6)`. Disabled actions use opacity 0.65. These treatments are inherited from global CSS, not copied into a parallel button system.

The switch off fill/border are `#374b5e` / `#52697e`; the available checked fill/border are `#2563eb` / `#5798f5`. Saved-on status and the circle-check SVG use the success color; errors use the error color. Unavailable analytics remains visibly off.

**The Shared Action Rule.** Privacy choice and Save actions reuse the existing reviews buttons, including their hover, focus and disabled treatment.

## Typography

Below 1024px the surface and saved notice use Golos Text with Arial/sans-serif fallbacks. From 1024px they use Rubik, then Golos Text and those fallbacks. Existing font assets and global typography are unchanged.

| Element | Implemented hierarchy |
| --- | --- |
| Notice title | 22px, weight 600, line-height 1.25, tracking −0.02em; 21px below 640px. |
| Settings title | 28px, weight 600 / 1.25; 23px below 640px, 20px at 350px or narrower. |
| General body | 16px / 1.6; 14px below 640px. |
| Category heading | 18px, weight 600 / 1.4; 17px below 640px. |
| Analytics switch label | 20px, weight 500; 18px below 640px, 16px at 350px or narrower. |
| Status / consent link | Status 14px / 1.5; consent link inherits body size and rhythm (16px desktop, 14px mobile). |
| Necessary badge | 12px. |
| Choice / Save actions | Existing reviews 16px, weight 600 / 26px. |
| Saved notice | 16px, weight 500 / 1.5. |
| Document page title / body | Existing policy h1: 38px / 48px desktop, 30px / 1.25 mobile; only the new page uses 28px at 350px or narrower. Body remains 16px / 1.7 at every width. |
| Document page section headings | Existing policy h2: 22px desktop, 21px mobile, line-height 1.4. |

Settings titles use balanced wrapping; narrow titles wrap at word boundaries. Reader headings retain the supplied uppercase text, numbering and punctuation; its body is not editorially rewritten.

## Layout

**Initial notice, every width:** fixed and horizontally centered at the bottom, with width `min(1000px, calc(100% - 48px))`, padding 22px 28px and bottom clearance `max(24px, env(safe-area-inset-bottom))`. Below 640px the width is `calc(100% - 28px)`, padding is 20px and bottom clearance is `max(14px, env(safe-area-inset-bottom))`. Maximum height is constrained to 80dvh and available safe-area height; short viewports scroll the panel. At 1440px the real capture reports 1000px width and approximately 228px height; height is content driven. The three actions sit in a row with a 12px gap / 16px top spacing; the group is centered from 1024px. Buttons retain their individual sizes. They stack below 640px with 10px gaps / 20px top spacing. This named region has no X, backdrop, focus trap or document scroll lock at any breakpoint.

**Settings (visual refinement 2026-10-16):** centered native dialog with outer border-box width `min(520px, calc(100% - 48px))`, 24px padding and existing available-height constraints. Below 640px its adaptive width remains `calc(100% - 28px)` and padding is 20px. The title is centered across the full dialog with symmetric inline padding; the existing close action is positioned absolutely at the right. Mobile title/close top offsets prevent the second line intersecting the 44px close hit area. Fonts and sizes are preserved.

The categories retain their content and order. The sections start 12px after the introduction, section vertical padding is 12px, category headings have 8px bottom spacing. The necessary badge stays beside its heading where it fits and wraps on mobile. Analytics uses 16px padding (14px inline on mobile), a complete 1px rounded border and no extra bottom margin. Its consent link follows the unchanged description in the same paragraph (variant A), keeps its underline and uses nowrap only on the link; at 350px and below natural link wrapping is allowed to prevent overflow. The temporary unavailable warning is removed from presentation; the counter gates and disabled switch are unchanged.

The centered switch group has 12px top spacing; the unchanged centered badge follows with 10px. The analytics-to-Maps divider is removed by the scoped `.settings .analytics + .section { border-top: 0; }`; its own card border remains. Maps is separated by vertical space only, with no bottom padding. Save retains its reviews treatment, centered 240px desktop/full mobile width, and 16px top spacing. Errors remain above it. The existing scroll layout keeps controls reachable on short viewports.

**Final desktop rhythm, 2026-10-16:** at widths from 640px the settings title-to-description gap is 20px; necessary-description-to-card is 20px; card block padding is 21px; description-to-switch is 22px; switch-to-status is 12px; card-to-Maps is 22px; Save top spacing is 22px. These are vertical-only overrides of the base layout above. Below 640px all previous spacing and header/close geometry remain unchanged. Width remains 520px; natural height at 1440×900 is 796.5px (was 742.5px). Current measured evidence is `artifacts/privacy-final-spacing/` and `docs/privacy-final-spacing.md`. Toast CSS and its conditions are unchanged; new Retina captures confirm its existing material, with mocked negative ACKs and a labelled light test backdrop.

**Consent document page:** `/privacy/analytics-consent` extends the incumbent policy reading surface with the existing Header, Footer and unchanged `src/app/privacy/privacy.module.css`. Its centered article has an 820px maximum width and the policy's responsive gutters, section spacing and ordinary browser scrolling. One h1 and ten h2 sections retain the original text and literal list numbering. The only local styles suppress duplicate HTML list markers and reduce the new page's h1 to 28px at 350px or narrower for the approved uppercase title. No new visual concept, decoration or imagery is introduced. The old document modal, Back/X controls and exclusive styles are removed. The source settings dialog remains open in its original tab with draft, switch, saved choice and scroll position preserved; its existing 520px desktop width is unchanged.

**Saved notice:** bottom centered, above `max(24px, env(safe-area-inset-bottom))`, width fitted to content and capped at the viewport width minus 28px, minimum height 52px, with 12px 20px padding and a 10px icon/text gap. It never locks scrolling, captures focus or intercepts clicks.

First-stage evidence is `artifacts/privacy-controls/`: real banner/settings captures at 320, 375, 390, 430, 768, 1024 and 1440px plus short heights, and `settings-error-real-503.png`. `visual-mocks/settings-saved-toast-{desktop,mobile}.png` explicitly watermark mocked negative API acknowledgements; `visual-mocks/status-{off,on,pending-on,pending-off}.png` watermark visual status models. These show appearance, not real journal success or positive consent. This documentation pass inspected current desktop/mobile and marked model captures; it ran no new browser checks.

## Elevation & Depth

The banner and settings retain `0 18px 60px rgba(0, 0, 0, 0.28)`. Only settings use the native `rgba(2, 9, 18, 0.62)` backdrop. The document page uses the existing policy surface without a modal backdrop. The analytics inset gains depth through its lighter navy. Reviews primary actions retain their existing inset highlight and restrained shadow.

The small saved notice is the scoped CSS glass exception: translucent navy `rgba(7, 26, 46, 0.66)` with a faint neutral top highlight, 22px backdrop blur with 145% saturation, a 1px `rgba(218, 240, 255, 0.48)` border, soft inset highlights and a restrained 6px/20px external shadow. Dimensions, timing and conditions are unchanged. Unsupported blur and reduced-transparency preferences use the opaque inset navy fallback. This is a web interpretation, not a native Liquid Glass API or a material rule for all cards and buttons.

## Shapes

Banner/settings containers retain 20px corners, reduced to 19px below 640px; analytics uses 12px, reviews actions 15px and modal X 8px. X remains a 44px square only in settings. The document page inherits policy geometry and has no modal controls. Status badges and the saved notice use capsule corners. The circle-check is the existing 20px SVG icon, not a text glyph.

The switch is a 46 × 26px pill with an 18px thumb offset 3px; its transparent native input has a 46 × 44px target. Checked movement is 20px. Background/thumb transitions are 180ms ease-out and disappear with reduced motion. Reviews actions retain their existing 180ms transitions and no active transform.

## Components

**Initial choice.** Exact title: “Мы используем cookies и Яндекс.Метрику”. Exact copy: “Сайт использует файлы cookie и другие технологии хранения для работы отдельных функций. Яндекс.Метрика помогает анализировать посещаемость и включается только с вашего согласия. Подробнее — в Политике обработки персональных данных.” The final policy phrase is the inline underlined `/privacy` link. There is no banner consent-document link. The three buttons at every width are “Принять”, “Только необходимые”, “Настроить”. Accept is disabled until analytics readiness gates are met, with “Включение аналитики временно недоступно” as its title. Escape, an outside click and scrolling do not dismiss this nonmodal region.

**Necessary-only refusal.** Analytics stops and the off choice with a pending decline/revoke is persisted locally before network work; the banner closes immediately. A failed journal request keeps that local refusal and pending outbox, without opening an error modal or showing a success notice. Automatic retry never creates a toast. Only the obsolete session key `autozap.privacy-banner-dismissed.v1` is removed; no new X dismissal state is written and unrelated navigation/return storage is preserved. If browser storage itself is blocked, analytics remains off but cross-reload persistence cannot be guaranteed.

**Settings and draft.** Exact introduction: “Здесь вы можете управлять использованием аналитики. Необходимые технологии обеспечивают работу отдельных функций сайта.” There is one analytics switch and no necessary/Maps switches. Saved consent and draft are separate. The badge has four exact texts: “Сейчас аналитика включена”, “Сейчас аналитика отключена”, “Аналитика будет включена после сохранения”, “Аналитика будет отключена после сохранения”. Its state is saved-on, saved-off or pending; it does not falsely present a draft as saved. An unavailable counter forces off presentation and disables the switch. The temporary unavailable warning was removed visually in the second stage; no readiness gate changed. Closing without saving discards the draft; a first visit returns to the banner, while a prior saved choice stays in force without resurrecting it.

**Consent document page.** “Прочитать полное согласие” keeps its existing text, style and position, with `href="/privacy/analytics-consent"`, `target="_blank"` and `rel="noopener noreferrer"`. Click and Enter open the new tab without an opener; returning to the source tab needs no in-document Back/X/Escape action. The page-only server renderer reads the single `analyticsConsentText` source. The approved document remains dated 2026-10-14, with ten sections and version `sha256:f801a44356ed08df59a848e25c006cd540e74efcf4a4dd08c50dd29057095d82`. Words, numbering, em-dashes, operator details and URLs remain intact; supplied HTTP(S) links retain `noopener noreferrer`. Reading sends no consent POST and loads no own Metrika SDK.

**Explicit save and errors.** The only settings action is “Сохранить настройки”, changing to “Сохраняем…” while busy. A valid acknowledged explicit settings save closes the dialog and creates one “Настройки сохранены” notice. The real registration failure retains the dialog and displays “Не удалось сохранить настройки. Попробуйте ещё раз.” with `role="alert"` above Save. Retry starts by clearing the prior error; reopening settings also clears it. Failed refusal leaves analytics off with the pending outbox. Busy state suppresses duplicate submissions and disables close/switch/actions. The server acknowledgement checks, journal protocol, withdrawal, synchronization and twelve-calendar-month expiry remain active.

**Saved notice.** The polite atomic live status contains the circle-check SVG and exact text “Настройки сохранены”. It appears with a gentle upward entry, begins its 180ms exit after 2500ms and unmounts at 2680ms. A repeat acknowledged save replaces/restarts the single notice; rerenders and reload do not replay it. Reduced motion removes movement and transitions while retaining the status. Banner Accept/necessary-only actions, failed saves and automatic outbox acknowledgements never trigger it. Route changes and opening settings clear it; route changes also clean up dialog/error state. Native modal opening locks document scrolling with scrollbar compensation and restores prior styles/focus when closing; no backdrop-click dismissal is added.

**Evidence limits.** The reports record actual negative POST 503 responses, zero own Metrika SDK requests and zero JavaScript page errors. The new functional report's console resource errors include expected local 503s and existing external-resource errors (400/404, certificate and DNS failures); this is not a zero-network-error claim. Negative successful acknowledgements are explicitly mocked. Earlier on and pending states are marked visual models because the counter ID/settings are unavailable. Real PostgreSQL success, positive-grant runtime, real SDK behavior and physical Safari/iOS/Android remain unverified. The pre-existing map limitation is outside this pass; no map investigation or modification was performed.

## Do's and Don'ts

- **Do** retain the nonmodal notice at every width, navy/font inheritance and actual reviews actions.
- **Do** distinguish local refusal, server acknowledgement, saved choice and unsaved draft.
- **Do** keep the settings link opening the separate document page in a new tab and preserve its approved text/version and source-tab state.
- **Do** keep successful explicit settings acknowledgement as the only source of the glass notice.
- **Don't** restore an X, legacy session dismissal, banner consent link or mobile modal banner.
- **Don't** enable positive consent or the own Metrika SDK before verified counter readiness and registration.
- **Don't** treat marked visual mocks, a narrow `ship` verdict or this document as backend verification, legal approval or permission to publish.
- **Don't** spread the scoped glass material or these local rules into frozen pages or unrelated UI.

Historical second-stage evidence: `artifacts/privacy-visual-stage2/` and `docs/privacy-visual-stage2.md`; final settings geometry is recorded in `artifacts/privacy-final-spacing/`. The light toast background is a labelled test fixture because the approved navy site has no large light section. All toast ACKs in visual demonstrations are explicitly mocked, never proof of journal persistence.

Current document-page evidence: `artifacts/privacy-analytics-consent-page/report.json`, `visual-preservation.json`, desktop/mobile top and full-page captures, and settings captures; details are in `docs/privacy-analytics-consent-page.md`. The page checks passed at eight requested sizes, including direct entry, reload, text identity, ten sections, keyboard scrolling and new-tab/source-state preservation. Controls regression passed eight scenarios at ten widths with zero JavaScript page errors and zero own Metrika SDK requests; keyboard checks passed with explicitly mocked negative ACKs. Typecheck, build, tests and targeted ESLint passed in the parent implementation run. Real PostgreSQL success, positive-grant/SDK behavior and physical devices remain unverified. This documentation handoff ran no browser or build checks.
