---

---

# Question

What do the apps widely regarded as best-designed actually do (per their own writing and the
platform guidelines), which of those practices transfer to an offline-first Tauri 2 desktop rent
tracker that is English and Arabic, and can the motion features the practices imply run in
Tauri 2's three webviews with this repository's installed Svelte?

Read on 2026-09-24. Everything below is true of the sources as read on that date.

# Sources

Primary unless marked. "Via search" means the page itself would not render for the fetch tool
(JavaScript-only) and the claim reached me through a search-engine summary of that page; treat
those as weaker.

Platform guidelines
- S1 Apple HIG, Right to left. https://developer.apple.com/design/human-interface-guidelines/right-to-left (read via its JSON data feed)
- S2 Apple HIG, Motion. https://developer.apple.com/design/human-interface-guidelines/motion
- S3 Apple HIG, Onboarding. https://developer.apple.com/design/human-interface-guidelines/onboarding
- S4 Apple HIG, Undo and redo. https://developer.apple.com/design/human-interface-guidelines/undo-and-redo
- S5 Apple HIG, Alerts. https://developer.apple.com/design/human-interface-guidelines/alerts
- S6 Apple HIG, Feedback. https://developer.apple.com/design/human-interface-guidelines/feedback
- S7 Apple HIG, Loading. https://developer.apple.com/design/human-interface-guidelines/loading
- S8 Apple HIG, Launching. https://developer.apple.com/design/human-interface-guidelines/launching
- S9 Apple HIG, Icons. https://developer.apple.com/design/human-interface-guidelines/icons
- S10 Apple HIG, Color. https://developer.apple.com/design/human-interface-guidelines/color
- S11 Apple HIG, Search fields. https://developer.apple.com/design/human-interface-guidelines/search-fields
- S12 Apple HIG, Writing. https://developer.apple.com/design/human-interface-guidelines/writing
- S13 Apple HIG, Keyboards. https://developer.apple.com/design/human-interface-guidelines/keyboards
- S14 WWDC18 session 803, Designing Fluid Interfaces. https://developer.apple.com/videos/play/wwdc2018/803/
- S15 WWDC23 session 10158, Animate with springs. https://developer.apple.com/videos/play/wwdc2023/10158/
- S16 Material Design 1, Bidirectionality (still served, marked "no longer maintained"). https://m1.material.io/usability/bidirectionality.html
- S17 Material Design 1, Duration and easing. https://m1.material.io/motion/duration-easing.html
- S18 Material 3 motion tokens as generated into Google's own `material-web` repository (v0.192). https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-sys-motion.scss
- S19 Material 3 Expressive motion physics, via search. https://m3.material.io/styles/motion/overview/how-it-works
- S20 Apple Design Awards 2026 page. https://developer.apple.com/design/awards/ and the 2021 page https://developer.apple.com/design/awards/2021/

App makers' own writing
- S21 Linear, "How we redesigned the Linear UI (part II)", 2024-03-28, Saarinen, Gillet, Eldh, Cascino. https://linear.app/now/how-we-redesigned-the-linear-ui
- S22 Linear, "Invisible details: building contextual menus", 2020-09-17, Andreas Eldh. https://linear.app/now/invisible-details
- S23 Linear Docs, Select issues. https://linear.app/docs/select-issues
- S24 Linear Method, Introduction. https://linear.app/method/introduction
- S25 Raycast, "A fresh look and feel", 2022-07-19, Thomas Paul Mann. https://www.raycast.com/blog/a-fresh-look-and-feel
- S26 Raycast developer docs, ActionPanel. https://developers.raycast.com/api-reference/user-interface/action-panel
- S27 Raycast developer docs, Prepare an extension for Store (its UI guidelines). https://developers.raycast.com/basics/prepare-an-extension-for-store
- S28 Superhuman, "How to build a remarkable command palette", 2021-10-12, Tim Boucher. https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/
- S29 Superhuman, "Superhuman is built for speed" (undated on fetch). https://blog.superhuman.com/superhuman-is-built-for-speed/
- S30 Superhuman, Rahul Vohra, "7 principles of game design", 2021-06-01 (first a16z 2020-01-13). https://blog.superhuman.com/game-design-not-gamification/
- S31 Cultured Code, Things home and features pages. https://culturedcode.com/things/ and https://culturedcode.com/things/features/
- S32 Stripe, "Designing accessible color systems", 2019-10-15, Koopersmith and Miner. https://stripe.com/blog/accessible-color-systems
- S33 Vercel, Web Interface Guidelines. https://vercel.com/design/guidelines
- S34 Notion Help, Notion Calendar keyboard shortcuts. https://www.notion.com/help/notion-calendar-keyboard-shortcuts

Essays (secondary in the sense that they are one practitioner's view, but they are the original text)
- S35 Aza Raskin, "Never Use a Warning When You Mean Undo", A List Apart 241, 2007-07-21. https://alistapart.com/article/neveruseawarning/ (title and date confirmed via search; body not re-read)
- S36 Jakob Nielsen, "Progressive Disclosure", NN/g, 2006-12-03. https://www.nngroup.com/articles/progressive-disclosure/
- S37 Emil Kowalski, "You don't need animations" (no date on page). https://emilkowal.ski/ui/you-dont-need-animations
- S38 Rauno (rauno.me), "Invisible Details of Interaction Design", 2023-07. https://rauno.me/craft/interaction-design

Web platform and runtime
- S39 MDN browser-compat-data, main branch (package 8.1.2), raw JSON for `api.Document.startViewTransition`, `css.at-rules.view-transition`, `css.at-rules.starting-style`, `css.properties.transition-behavior`, `css.types.easing-function.linear-function`. https://github.com/mdn/browser-compat-data
- S40 Safari release notes 17.4, 17.5, 18, 18.2, 26 (Apple JSON feed). https://developer.apple.com/documentation/safari-release-notes/safari-18-release-notes (and siblings)
- S41 Tauri 2, Webview versions. https://v2.tauri.app/reference/webview-versions/
- S42 WebKitGTK 2.46 and 2.48 highlights. https://webkitgtk.org/2024/10/04/webkitgtk-2.46.html , https://webkitgtk.org/2025/04/08/webkitgtk-2.48.html
- S43 Ubuntu and Debian package indexes for `libwebkit2gtk-4.1-0`. https://packages.ubuntu.com/noble-updates/libwebkit2gtk-4.1-0 , https://packages.ubuntu.com/jammy-updates/libwebkit2gtk-4.1-0 , https://packages.debian.org/bookworm/libwebkit2gtk-4.1-0
- S44 CSS View Transitions Module Level 1, W3C Candidate Recommendation Draft. https://www.w3.org/TR/css-view-transitions-1/
- S45 MDN, Using the View Transition API. https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using
- S46 Svelte docs, `animate:` and `svelte/motion`. https://svelte.dev/docs/svelte/animate , https://svelte.dev/docs/svelte/svelte-motion
- S47 Svelte 5.56.10 source as installed in this repository: `svelte/src/animate/index.js` and `svelte/src/compiler/phases/2-analyze/visitors/shared/element.js`, `svelte/src/compiler/errors.js`.
- S48 CSS Text Module Level 3, section 7.2.1 Cursive Scripts, CRD 2026-08-14. https://www.w3.org/TR/css-text-3/#cursive-tracking
- S49 W3C, Arabic and Persian Layout Requirements (alreq), Group Draft Note 2025-10-02. https://www.w3.org/TR/alreq/

Repository files read
- `apps/desktop/package.json`, `packages/design/package.json`, `apps/desktop/tauri/tauri.conf.json`, `.aep/rules/frontend.md` (Motion section), `.aep/efforts/ui-overhaul/evidence/research/svelte-motion-mechanism.md`, `apps/desktop/src/lib/design/block/list.svelte`.

# Findings

## 1. Which apps, on what evidence

- **source** The 2026 Apple Design Awards winners in the app categories are grug, Guitar Wiz, NBA: Live Games & Scores, Moonlitt, Primary: News in Depth, and Tide Guide. None is a productivity or record-keeping app of this app's kind. [S20]
- **source** Cultured Code states Things has won the Apple Design Award twice and quotes Apple: "Things 3 sets the standard for how apps should be designed and developed." [S31] The per-year ADA pages for 2017 redirect to the current year, so the award year was not confirmed on Apple's side. [S20]
- **source** Craft appears on Apple's 2021 ADA page as a finalist in Interaction, not a winner. [S20]
- **observation** Of the candidates, those with real primary design writing that I could read are: Apple (HIG, WWDC), Linear (blog and docs), Raycast (blog and developer UI guidelines), Superhuman (blog), Things (feature pages, thin), Stripe (colour essay), Vercel (Web Interface Guidelines). Arc, Craft, Notion Calendar and Figma yielded no primary design writing in this pass (see Not checked).
- **interpretation** "Regarded as best-designed" for this class of app rests on practitioner reputation and the makers' own writing more than on awards; the ADA evidence applies to Things only.

## 2. Recurring practices, what the sources say

### 2a. One universal way to search and act (command menu)

- **source** Superhuman: "Wherever your user is in your app, they must be able to bring up the command palette by using the same keyboard shortcut." Cmd+K "you can instantly do any action, and also learn the shortcut for next time." Fuzzy matching tolerates typos; synonyms are shown as "Mark Done (Archive)"; hide commands only when "fully irrelevant". [S28]
- **source** Linear docs: once an issue is selected or highlighted, the same action is available by keyboard shortcut, the command menu (Cmd/Ctrl K) or right-click contextual menu; Esc clears the selection. [S23]
- **source** Linear: contextual menus are "a great tool for onboarding and teaching people how to use our popular keyboard shortcuts" because each item shows its shortcut. [S22]
- **source** Raycast: the first action in an ActionPanel is the primary action (Enter) and the second the secondary (Cmd+Enter), assigned automatically; sections group related actions. [S26] The 2022 redesign consolidated "actions, toasts, and navigation" into one bottom action bar showing Cmd+K. [S25]
- **source** Raycast store guidelines: action titles in Title Case; "Add ellipses … for actions that will have a submenu"; if some actions have icons, all must; never leave a search bar without a placeholder. [S27]
- **source** Notion Calendar: `?` lists all shortcuts. [S34] Linear likewise lists shortcuts on `?` (via Linear changelog search result). [S23]
- **source** Things: "you just start typing where you want to go and instantly you're transported there" (Type Travel, no shortcut needed). [S31]
- **source** Apple HIG Search fields: start search as the person types; show recent or suggested terms; most relevant first; default to a broad scope and let people narrow it; tokens for common filters. [S11]
- **interpretation** The common shape across Linear, Raycast, Superhuman: one invocation everywhere, the same verb set reachable from three surfaces (button, contextual menu, command menu), each surface displaying the shortcut so the slow path teaches the fast one.

### 2b. One create, one edit, undo instead of confirm

- **source** Apple HIG Alerts: "Avoid displaying alerts for common, undoable actions, even when they're destructive." Reserve alerts for uncommon destructive actions that cannot be undone. Button titles are specific verbs ("Delete", "Erase"), not OK; Cancel is always "Cancel"; do not apply destructive style when the person deliberately chose the destructive action. [S5]
- **source** Apple HIG Feedback: "don't warn people when data loss is the expected result of their action", e.g. Finder does not warn on every trash. [S6]
- **source** Apple HIG Undo: help people predict the result ("Undo Typing"); "Show the results of an undo" (scroll to the restored item); allow multiple undo; on macOS Cmd+Z and Shift+Cmd+Z in the Edit menu. [S4]
- **source** Vercel: "Update the UI immediately when success is likely; reconcile on server response"; "On failure, show an error & roll back or provide Undo"; destructive actions "Require confirmation or provide Undo with a safe window." [S33]
- **source** Raskin's essay title states the rule: "Never use a warning when you mean undo". [S35]
- **source** Linear: "C to create an issue in any view" (one create key everywhere, via Linear docs search result). [S23] Things: tapping the Magic Plus button "creates a new to-do" in whatever list you are in. [S31]

### 2c. Keyboard-first with visible hints

- **source** Apple HIG Keyboards: respect standard shortcuts, do not repurpose them; define custom shortcuts "for only the most frequently used app-specific commands"; list modifiers in order Control, Option, Shift, Command; let the system mirror shortcuts in RTL layouts. [S13]
- **source** Vercel: all flows keyboard-operable per WAI-ARIA; visible focus ring using `:focus-visible`; internationalise shortcuts for non-QWERTY layouts. [S33]
- **source** Raycast's redesign put shortcuts "prominently displayed in action bar". [S25]

### 2d. Progressive disclosure

- **source** Nielsen: "Initially, show users only a few of the most important options. Offer a larger set of specialized options upon request." Beyond two levels "typically have low usability". [S36]
- **source** Linear Method: "A tool should be simple to get started with and grow more powerful as you scale." [S24]
- **source** Apple HIG Onboarding: "Postpone nonessential setup flows or customization steps. Provide reasonable default settings." [S3]

### 2e. Density, typography, restraint in colour

- **source** Linear 2024: adjusted "sidebar, tabs, headers, and panels to reduce visual noise, maintain visual alignment, and increase the hierarchy and density of navigation elements"; moved theme generation to LCH with three inputs (base, accent, contrast); limited "how much chrome (blue in our case)" for "a more neutral and timeless appearance"; Inter Display for headings, Inter for body. [S21]
- **source** Stripe: built its palette in a perceptually uniform space (CIELAB) so any two colours "at least five levels apart" meet small-text contrast. [S32]
- **source** Apple HIG Color: "Avoid using the same color to mean different things"; do not rely on colour alone; "Consider choosing a limited color palette". [S10]
- **source** Vercel: tabular numerals for compared numbers; currency with 0 or 2 decimals consistently within a context; "Don't rely on color alone"; hover/active/focus higher contrast than rest. [S33]

### 2f. Icons

- **source** Apple HIG Icons: all interface icons need "a consistent size, level of detail, stroke thickness (or weight), and perspective"; match icon weight to adjacent text; optically centre asymmetric glyphs; provide accessible labels. [S9]
- **source** Raycast commissioned one icon set "with consistent stroke width and corner radii". [S25] Raycast store rule: if some actions have icons, all do. [S27]
- **observation** This repository imports two icon families: `@lucide/svelte` (211 import lines across `apps/desktop/src` and `packages/design/src`) and `@tabler/icons-svelte` (52 import lines in `apps/desktop/src`). Counted with grep on 2026-09-24; not audited for which glyphs mix on one surface.

### 2g. Empty states and first run that teach by doing

- **source** Apple HIG Onboarding: "Teach through interactivity"; prefer "a collection of context-specific tips instead of a single onboarding flow", displayed "near that area"; keep any required flow brief; make tutorials optional and findable later. [S3]
- **source** Apple HIG Writing: "Provide clear next steps on any blank screens." [S12] Apple has no separate HIG page for empty states (the URL returns the generic shell). [S12]
- **source** Apple HIG Launching: "Restore the previous state when your app restarts". [S8] Apple HIG Loading: "Show something as soon as possible" with placeholders. [S7]
- **source** Superhuman's principles: "Create goals that are concrete, achievable, and rewarding"; "Make the next action obvious"; "Give clear and immediate feedback with no distractions". [S30]
- **source** Raycast: show a loading indicator rather than a momentary "No results" empty view while data loads. [S27] Vercel: design empty, sparse, dense and error states; "Every screen offers a next step or recovery path"; skeletons mirror final content. [S33]

### 2h. Implicit guidance

- **source** Apple HIG Writing: be action-oriented, label buttons with verbs; "Give clear guidance and use consistent language throughout processes with multiple steps"; show hint or placeholder text with an example of the format; if directing someone to a setting, "provide a direct link or button". [S12]
- **source** Apple HIG Feedback: integrate status near the thing it describes rather than interrupting; "Show people when a command can't be carried out and help them understand why." [S6]
- **source** Vercel: "Prefer inline explanations; use tooltips as a last resort"; do not pre-disable submit, show errors next to their fields and focus the first error on submit; placeholders as example values; Enter submits a single-field form; move and return focus per WAI-ARIA; "Match visual & hit targets", "No dead zones". [S33]
- **source** Things: natural-language date entry "smartly detects what you're typing and figures out what you mean". [S31]
- **source** Superhuman: "Make the next action obvious. Remove decision friction by automatically surfacing what users should do next." [S30]
- **source** Linear's submenu "safe area" triangle lets the pointer move diagonally without closing the menu; a detail "you won't see ... but will hopefully feel". [S22]

### 2i. Feedback and optimistic response

- **source** Superhuman cites 100 ms as the threshold of "instantaneous" and targets under 50 ms; lists local caching, preloading, keyboard shortcuts, "Minimal animations" and the command palette as its speed features. [S29]
- **source** Vercel: optimistic update with rollback or Undo; loading indicator keeps the original label; show-delay about 150 to 300 ms and minimum visible time about 300 to 500 ms to avoid spinner flicker; "Saving…" ends with an ellipsis. [S33]
- **source** Apple HIG Feedback: confirm completion only for significant actions, "because people typically expect their action or task to succeed, they only need to know when it doesn't." [S6]

### 2j. Motion

- **source** Apple HIG Motion: "Add motion purposefully"; "Make motion optional" and never the only carrier of information; "Aim for brevity and precision in feedback animations"; "generally avoid adding motion to UI interactions that occur frequently"; "Let people cancel motion ... don't make people wait for an animation to complete". [S2]
- **source** WWDC18: principles of response (latency), constant redirection and interruption, spatial consistency ("If something disappears one way, we expect it to emerge from where it came"), springs described by damping and response rather than duration; 100 % damping for a tap, about 80 % when a gesture carries momentum. [S14]
- **source** WWDC23: springs preserve velocity when retargeted, which is why they interrupt smoothly; Apple standardised on two parameters, duration and bounce; "When you're not sure, use a spring with bounce 0"; be cautious above about 0.4 bounce. [S15]
- **source** Material 1: desktop animations "should last 150ms to 200ms" and be "faster and simpler than their mobile counterparts"; mobile about 300 ms; asymmetric easing (standard 0.4,0,0.2,1; decelerate 0,0,0.2,1 for entering; accelerate 0.4,0,1,1 for leaving). [S17]
- **source** Material 3 tokens: durations short1 to short4 = 50, 100, 150, 200 ms; medium1 to medium4 = 250 to 400 ms; easing standard `cubic-bezier(0.2, 0, 0, 1)`, emphasized-decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)`, emphasized-accelerate `cubic-bezier(0.3, 0, 0.8, 0.15)`. [S18]
- **source (via search)** Material 3 Expressive replaces easing-and-duration with a spring "motion physics system" defined by stiffness, damping and initial velocity, split into spatial springs (position, size) and effects springs (colour, opacity). [S19]
- **source** Vercel: provide a reduced-motion variant; CSS over WAAPI over JS libraries; animate `transform` and `opacity`; "Animations are cancelable by user input"; "Never `transition: all`"; "Only animate when it clarifies cause & effect or when it adds deliberate delight". [S33]
- **source** Kowalski: keyboard-initiated and many-times-a-day actions (command menus, list navigation) should not animate; UI animation "should generally stay under 300ms". [S37] Rauno: interruptibility modelled on the physical world; frequent interactions lose novelty and do not deserve a flourish. [S38]
- **interpretation** The sources agree on: motion only where it explains cause and effect or spatial origin; short (desktop 150 to 250 ms, never over about 300 ms for UI); interruptible; none on high-frequency keyboard paths; reduced-motion honoured. Springs are preferred by Apple and now Material specifically because they are interruptible and preserve velocity.

## 3. Bidirectional design

- **source** Apple HIG RTL: flip controls that show progress (sliders, progress indicators) and those that navigate a fixed order (back points right in RTL; next/previous flip); keep controls that refer to a real direction; "Don't reverse the order of numerals in a specific number" (phone, card, "541"); reverse the order of numerals that show progress or counting direction but "never flip the numerals themselves"; align a paragraph of three or more lines by its own language, one- and two-line blocks by the context; consistent alignment across a list; increase Arabic about 2 pt beside all-caps Latin. [S1]
- **source** Apple HIG RTL icons: flip icons that represent text or reading direction and those showing forward or backward motion; do not flip logos or universal marks like the checkmark; generally do not flip real-world objects (a clock looks the same everywhere); keep slashes, badges and magnifying glasses in their design-language orientation; do not flip right-handed tools. [S1]
- **source** Apple HIG RTL numbers: Arabic may use Western or Eastern Arabic numerals depending on country and region; apps not about numbers "can generally rely on system-provided number representations". [S1]
- **source** Material 1 Bidirectionality: not mirrored are untranslated text, icons that do not communicate direction (camera), numbers such as clock and phone numbers, clockwise refresh and history icons, physical objects like keyboards, the search icon's right-hand handle, and slashes; "Do not mirror media playback buttons and the media progress indicator" since they represent "the direction of the tape"; a progress bar in RTL fills right to left; calendar days run right to left; "next page" sits on the left; numbers "must be localized for languages that use different numerals"; undo/redo icons carry both circular and horizontal direction and need a choice. [S16]
- **source** CSS Text 3 section 7.2.1: a UA that cannot stretch a cursive script with elongation "must not apply spacing between any pair of that script's typographic letter units at all"; both cases yield zero effective spacing between Arabic letters. [S48]
- **source** W3C alreq: "Arabic ascenders and descenders extend much further than those of the Latin script, and care must be taken to correctly align text in the different scripts when they appear together"; Eastern regions (Egypt, Saudi Arabia, Iraq) use Arabic-Indic digits, Western regions (Algeria, Morocco) European digits; Arabic-Indic digits are bidi class AN, European digits EN, which changes ordering in RTL runs; justification uses kashida and other mechanisms rather than letter spacing. [S49]
- **observation** In Node 24 (ICU 78.3, CLDR 48.0), `Intl.NumberFormat('ar')` formats 1234.5 as `1,234.5` with `latn` digits, while `ar-SA` and `ar-EG` produce `١٬٢٣٤٫٥` with `arab` digits and `ar-AE` and `ar-MA` produce `latn`. The `-u-nu-latn` extension forces Western digits. This is true of Node's ICU; WebView2 and WebKit ship their own ICU and were not tested.
- **observation** The repository already mirrors some directional glyphs with `rtl:-scale-x-100` or `rtl:rotate-180` (22 occurrences; e.g. `packages/design/src/lib/block/back-control.svelte`). No `@font-face` was found in the CSS under `apps/desktop/src` or `packages/design/src`; the font stack was not traced further.

## 4. Can the motion features run in Tauri 2's webviews

Feature minimum versions per MDN BCD [S39], cross-checked with Safari release notes [S40]:

| Feature | Chromium (WebView2 follows it) | Safari / WKWebView |
| --- | --- | --- |
| `document.startViewTransition` (same-document) | 111 | 18 (notes: "Added support for View Transitions") |
| `startViewTransition({types})` options object, view-transition classes and types | 125 | 18.2 |
| `@starting-style` | 117 | 17.5 |
| `transition-behavior: allow-discrete` | 117 | 17.4; transitioning `display` itself 18 |
| `linear()` easing | 113 | 17.2 (17.4 notes "Fixed CSS linear() easing") |

- **source** Tauri: Windows uses WebView2, which "can update itself, you are guaranteed a relatively recent chromium build"; macOS uses the system WKWebView "updated with the regular OS updates"; Linux uses webkit2gtk from the distribution. [S41]
- **source** Safari 17.4 and 17.5 were available for macOS Monterey, Ventura, Sonoma; Safari 18 and 18.2 for macOS 15 Sequoia, Sonoma and Ventura; Safari 26 for macOS 26, Sequoia and Sonoma. [S40]
- **interpretation** On Windows all five features are present on any evergreen WebView2 (Chromium 125 shipped in 2024). On macOS, same-document View Transitions need the WebKit of Safari 18, so macOS 15 or later is certain; whether a Ventura or Sonoma machine that installed the Safari 18 update gives WKWebView the same WebKit is not established from a primary source (see Not checked). macOS 12 Monterey tops out at Safari 17.x, so it has `@starting-style` and `allow-discrete` but no View Transitions.
- **source** WebKitGTK 2.46 enabled "CSS View Transitions"; 2.48 added cross-document transitions and "many improvements overall". [S42]
- **source** Current `libwebkit2gtk-4.1-0` in distribution updates: Ubuntu 22.04 `2.50.4`, Ubuntu 24.04 `2.52.6`, Debian 12 `2.50.6`. [S43]
- **interpretation** On mainstream maintained Linux distributions the WebKitGTK in updates is past 2.46, so same-document View Transitions are available there; an unpatched or older distro may not have them.
- **source** During the animating phase, captured elements "are not painted ... and do not respond to hit-testing (as if they had pointer-events: none)"; while rendering is suppressed for the update, "all pointer hit testing must target its document element". [S44] Starting a new transition while one runs skips the previous one. [S45] (MDN's page says the new view is interactive during the transition; the spec text above qualifies that for captured elements.)
- **interpretation** View Transitions cross-fade or morph snapshots and cannot be retargeted mid-flight the way a spring can; they suit page or pane swaps more than frequently repeated interactions. `linear()` can encode a spring-shaped curve, but it is still a fixed-duration curve, not velocity-preserving (the Chrome article I meant to cite for this returned 404; this is my reasoning).
- **observation (repo)** `apps/desktop/tauri/tauri.conf.json` declares `"bundle": { "targets": "all" }` and no `minimumSystemVersion`; no macOS floor was found in the config read. Installed versions: `svelte ^5.56.10` (resolved 5.56.10 in `node_modules/.pnpm`), `tailwindcss ^4.3.3`, `tw-animate-css ^1.4.0`, `bits-ui ^2.19.0`, `@lucide/svelte ^1.33.0`, `@tabler/icons-svelte ^3.46.0`, `@tauri-apps/api ^2.11.1`.

### Svelte 5 motion

- **source** `svelte/motion` exports `Spring` and `Tween` (since 5.8.0), `prefersReducedMotion` (since 5.7.0), and deprecated `spring`/`tweened`; `Spring.of(fn)` binds a spring to a derived value. [S46]
- **source** `animate:` must sit on an element that is an immediate child of a keyed each block and runs "when the index of an existing data item within the each block changes", not on add or remove; `css` animations are preferred because "web animations can run off the main thread". The docs say nothing about reduced motion. [S46]
- **source (installed code)** Svelte 5.56.10's `flip` reads `getBoundingClientRect`-derived `from`/`to` rects, captures the element's current computed `transform`, and animates `transform: ${transform} translate(dx, dy) scale(...)`; default duration `Math.sqrt(d) * 120` ms, easing `cubicOut`. [S47]
- **source (installed compiler)** The compiler rejects `animate:` unless the element's parent is a keyed `EachBlock` and that block body has exactly one node other than comments, `{@const}` tags and whitespace; the error text is "must be the only child of a keyed `{#each ...}` block". [S47]
- **observation (repo)** `.aep/rules/frontend.md` lists "an element moving position" as "unavailable". The earlier research (`ui-overhaul/.../svelte-motion-mechanism.md`) reasoned that FLIP cannot animate absolutely-positioned virtualized rows, and itself recorded that this was reasoning, not a quoted fact or a test. In `list.svelte`, each virtual row is an absolutely positioned `div` with inline `transform: translateY(...)`, wrapped in `{#if row}` inside `{#each virtualRows as virtualRow (virtualRow.key)}`; inside a multi-column row there is a nested `{#each row.records as item, column (item.id)}` whose single child is one `div`.
- **interpretation** Svelte itself ships a move mechanism (`animate:flip`), so "an element moving position is unavailable" is not true of the framework. Whether it is true of this list is a narrower question: (a) the outer row cannot take `animate:` as written, because the `{#if row}` wrapper breaks the only-child rule; (b) nothing in `flip`'s code requires normal flow, since it works from measured rects and composes with the existing transform, so absolute positioning is not by itself the obstacle; (c) rows that enter or leave the virtualizer's window are add/remove, not moves, so a record moving far will not glide; (d) the inner per-record `each` compiles for `animate:`. None of this was run.

# Conclusion

Findings only.

1. The best-regarded tools converge on a small set of practices that are stated in their own words: one invocation for search and action everywhere (Cmd/Ctrl K), the same verbs reachable from button, contextual menu and command menu with shortcuts shown on each; undo in place of confirmation for common destructive acts, with alerts kept for rare irreversible ones; optimistic response; progressive disclosure to at most two levels; restrained, perceptually uniform colour; one consistent icon family; empty states that name the next step; onboarding by doing and by contextual tips; motion that is short, purposeful, interruptible and absent on high-frequency keyboard paths.
2. Bidirectional rules are specific and agree between Apple and Material: mirror direction-of-reading and ordered-navigation elements and progress; never reverse digits within a number; do not mirror clocks, checkmarks, logos, media transport, slashes or right-handed tools; Arabic takes no letter spacing; Arabic digit choice varies by region and follows the locale's numbering system.
3. In Tauri 2: Windows has every feature asked about; macOS 15+ has every feature; macOS Monterey lacks View Transitions; Ventura and Sonoma depend on an open WebKit-update question; current maintained Linux distributions have them via WebKitGTK 2.50+.
4. Svelte 5.56.10 ships `Spring`, `Tween`, `prefersReducedMotion` and `animate:flip`. The repository rule's "unavailable" is a claim about this list's structure, and the structural blocker found is the `{#if}` wrapper and virtual window, not absolute positioning.

## What transfers here

Each item is a practice with its sources; whether to adopt is for the spec.

1. One command menu on Cmd/Ctrl K from every screen, listing both navigation (complexes, units, tenants, contracts) and actions, with fuzzy match and synonyms, hiding only actions that cannot apply. [S28, S23, S11]
2. Every record action exists in three places with the same label and shortcut: a visible control, the right-click menu, and the command menu; each surface shows the shortcut. [S23, S22, S25]
3. On any list, Enter performs the primary action and a fixed secondary key the secondary one; the order of actions in every action menu is the same across record types. [S26]
4. One create pattern: a single create key and one create surface per record type, consistent across all lists. [S23, S31]
5. Deleting or archiving a record is immediate with an Undo toast and Cmd/Ctrl Z; a confirmation dialog only for rare, irreversible or cascading operations (for example, removing a complex with contracts), whose button is the verb and not OK. [S5, S6, S4, S33, S35]
6. Undo shows its result: after undoing, the restored record is scrolled into view and highlighted. [S4]
7. Writes appear optimistically; a spinner appears only after a delay of about 150 to 300 ms and stays at least about 300 ms; failures roll back with an inline error. [S33, S29]
8. Every empty list says what it will hold and offers the one next action inline; no momentary "no results" before the first data arrives. [S12, S27, S33]
9. First run is the real app with contextual tips near the control they explain, sensible defaults, and nonessential setup postponed; any required flow is short and any tutorial is skippable and findable later. [S3, S30]
10. Forms: labels on every field, example placeholders, errors next to the field, focus to the first error on submit, submit never pre-disabled, Enter submits single-field forms. [S33, S12]
11. At most two disclosure levels; advanced fields live behind one clearly named expander. [S36]
12. One icon family at one stroke weight matched to text weight; if any item in a menu has an icon, all do. [S9, S27]
13. Colour carries one meaning per hue (status), never alone; neutral chrome with one accent; palettes checked in a perceptual space. [S10, S21, S32, S33]
14. Money and counts use tabular numerals and one decimal convention per context. [S33]
15. Motion budget: 150 to 250 ms for UI transitions, decelerate on enter, accelerate on exit, nothing over about 300 ms; no animation on keyboard-driven list navigation or the command menu; every animation interruptible; every one gated by `motion-safe:` or `prefersReducedMotion`. [S2, S17, S18, S37, S33]
16. Reordering within a visible set (for example records inside a row, a sorted short list) can use Svelte's `animate:flip` without a new dependency, subject to the only-child rule and gating; springs via `svelte/motion` `Spring` where a value is retargeted repeatedly. [S46, S47, S15]
17. Pane or page swaps can use same-document View Transitions with feature detection and a no-animation fallback, given the macOS and Linux spread above. [S39, S40, S42, S44]
18. RTL: mirror back/next, chevrons of sequence, progress and sliders, and text-shaped icons; do not mirror clocks, calendars' glyph, checkmarks, search magnifier, slashes, logos; never reverse digits within amounts, phone numbers or IDs; reverse the order of sequences that show progress. [S1, S16]
19. Arabic text: no `letter-spacing`/`tracking-*` on Arabic runs; allow more line height than Latin for mixed runs; choose the digit system deliberately per locale (`-u-nu-latn` or `-u-nu-arab`) rather than inheriting `ar`'s default. [S48, S49, S1]
20. Restore the last place (route, selection, scroll) on launch. [S8]

## What does not transfer

- **Touch gestures, momentum projection and one-to-one drag tracking** (WWDC18's core examples). A pointer-and-keyboard desktop app has few continuous gestures; the principle (respond instantly, allow redirection) transfers, the gesture mechanics do not. [S14]
- **Haptics as a feedback channel.** Apple pairs motion with haptics; a desktop webview has none. [S2, S6]
- **Mobile durations and 44 px touch targets.** Material scales durations down for desktop (150 to 200 ms); Vercel's 44 px is a mobile minimum, 24 px applies to pointer. [S17, S33]
- **Concierge onboarding** (Superhuman's 1:1 calls) is a business practice, not an interface one. [S30 search context]
- **Launch screens.** The HIG says they are not applicable to macOS. [S8]
- **Media-transport non-mirroring** has no subject here; the app has no media. [S16]
- **Bouncy springs** (Material Expressive's low damping, Apple bounce above 0.3) read as playful; Apple advises caution above about 0.4 for UI. [S15, S19]
- **Things' Type Travel without a shortcut** relies on no text field having focus; in a form-heavy app it conflicts with typing and is an interpretation, not a tested fit. [S31]

# Not checked

- **Arc, Craft, Notion Calendar, Figma.** Arc's search returned only secondary blogs about its Command Bar; no Browser Company design writing was read. Craft's evidence is only its 2021 ADA finalist listing. Notion Calendar: only the help-centre shortcut page, which confirms `?` but not Cmd+K (Cmd+K came from a secondary search result, so it is not claimed as a finding). Figma was not examined. The Stripe Dashboard's interaction design was not read beyond the colour essay.
- **Material 3 pages** at m3.material.io render only with JavaScript; M3 motion claims rest on `material-web` generated tokens (primary) and, for Expressive springs, a search summary (weaker). Material 3's current bidirectionality page was not read; Material 1's page is the source used.
- **Apple ADA archive pages** for 2017 redirect to 2026; the Things award years are Cultured Code's claim only.
- **Raycast manual** (`raycast.com/manual/action-panel`) returned 404. Superhuman's onboarding game article URL tried returned 404.
- **WKWebView on Ventura or Sonoma after a Safari 18 update**: whether WKWebView in a third-party app gets the updated WebKit was not established from Apple documentation. This decides whether View Transitions work for macOS 13 and 14 users.
- **No macOS minimum** was found in `tauri.conf.json`; Tauri's own default and the Cargo bundle settings were not read.
- **ICU numbering defaults in WebView2 and WebKit**: only Node's ICU was observed. The digit behaviour of `ar` in the shipped webviews is untested.
- **Whether Chromium and WebKit already suppress `letter-spacing` on Arabic** as the spec requires was not tested; the spec requirement is what is recorded.
- **`animate:flip` against the virtualized list** was not built or run; the analysis is from source reading. The reduced-motion behaviour of `tw-animate-css` remains open, as the earlier research also recorded.
- **Kowalski's essay** has no date on the page. Superhuman's speed article had no date on fetch. The Chrome `linear()` article returned 404, so the claim that `linear()` is fixed-duration and not velocity-preserving is my reasoning.
- **Arabic line-height values**: no source gave a number; alreq gives only the qualitative warning.
