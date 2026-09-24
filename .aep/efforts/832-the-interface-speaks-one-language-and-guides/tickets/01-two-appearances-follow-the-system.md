---
status: resolved
---

# feat(design): two appearances follow the system, with an override in settings

## Outcome

The application draws in a light or a dark appearance. It follows the operating system live by
default, and general settings offer system, light and dark, persisted in the settings file and
applied before the window is shown, so no frame paints in the wrong appearance. Every colour and
chart token has both values. Toasts follow the resolved appearance. `mode-watcher` is gone, and
the token layer no longer says "one palette, no modes".

## Acceptance Criteria

Traces requirement 2 of [[efforts/832-the-interface-speaks-one-language-and-guides/spec]] and its
criterion 2.

- [x] `packages/design/src/lib/tokens.css` holds light values on `:root` and dark values under
      `.dark`. The light block starts from
      [[efforts/832-the-interface-speaks-one-language-and-guides/evidence/prototypes/the-light-appearance]]
      and is adjusted until the contrast test passes. The header's single-palette paragraph is
      rewritten to describe two appearances. Verified: `tokens.css` holds light on `:root` and dark under `.dark`, started from the prototype draft (warning, success, permitted, money adjusted); header rewritten.
- [x] A node test parses both blocks and asserts every colour token declared in one is declared
      in the other, and that foreground, muted-foreground and each tone meet WCAG AA (4.5:1)
      against background, card and popover, in both. It uses a hand-written oklch-to-luminance
      function and adds no colour library. Verified: design `tokens.test.ts` (parity plus WCAG AA, hand-written oklch luminance) passes on the effort branch with motion tests, 24 of 24; worst light margins: muted-foreground 5.4, success 4.65, permitted 4.64.
- [x] `apps/desktop/src/lib/platform/appearance.ts` resolves `system | light | dark`. It follows
      `prefers-color-scheme` live under system and sets the `dark` class and `color-scheme` on
      `<html>`. A node test covers resolution for each setting and the live follow. Verified: `platform/appearance.ts` resolves system, light, dark and follows `prefers-color-scheme` live; `appearance.test.ts` with startup, motion and toast tests passes 47 of 47 on the effort branch.
- [x] Rust `Settings`, `SettingsStored` and `SettingsChangeset` carry `appearance`, defaulting to
      system through `serde(default)`. A Rust test round-trips the key and reads an old file as
      system. `host.ts`, the settings router's input and the host fake follow. Verified: `cargo test settings` on the effort branch: 4 passed (round trip, old file reads as system, changeset); host.ts, router input and host fake updated.
- [x] Startup applies the stored appearance before `window.show()`. General settings shows the
      choice as a toggle group of three, applied at once, following the locale's optimistic
      pattern. Verified: a startup port applies the appearance before any `window.show()`, pinned by two tests in `startup.test.ts` (in the 47); general settings shows a three-option toggle group via optimistic `useSetAppearance`; `pnpm check` 0 errors.
- [x] `app.html` no longer hard-codes `class="dark"`. The chart primitive's `.dark` selectors
      still match in dark. Sonner takes its theme from the resolved appearance, and `mode-watcher`
      is removed from `packages/design/package.json`. Verified: `app.html` has no `class=\"dark\"` (grep count 0); no source imports `mode-watcher` and it is gone from the design package.json; chart keeps `.dark` selectors; Sonner takes the resolved appearance as `theme`.
- [x] `[[contexts/repository]]` Constraints and `[[rules/frontend]]` *Styling* say there are two
      appearances.
 Verified: `contexts/repository.md` Constraints and `rules/frontend.md` *Styling* state two appearances; validate.mjs no failures.
## Relevant areas

- `packages/design/src/lib/tokens.css`, `primitive/sonner/sonner.svelte`, `primitive/chart/chart-utils.ts`
- `apps/desktop/src/app.html`, `apps/desktop/src/lib/layout/startup.ts` (the settings read before
  the locale loads, around `:430`), `routes/+layout.svelte` (`:256`)
- `apps/desktop/tauri/src/settings.rs`, `apps/desktop/src/lib/platform/host.ts`,
  `settings/router.ts`, `settings/query.ts`, `settings/component/area.svelte` (general section),
  `settings/component/locale.svelte` as the model
- `platform/tests/testing.ts` (the host fake)

## Constraints

- The plan's *Architecture 2* is the mechanism. `light-dark()` and Tauri `setTheme` were rejected
  there.
- Borders and inputs in light are black alpha, not white alpha.
- Every tone keeps its meaning in both appearances. A tone darkened for light is still the same
  token.

## Notes

The prototype's light values are a draft, and the human accepted light on sight rather than
value by value. Expect to adjust muted-foreground and the tones for contrast.
