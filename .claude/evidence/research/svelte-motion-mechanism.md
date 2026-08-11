---
owner: repository
kind: research
falsifies: []
---

# Does a motion library beat Svelte's built-ins for this application's animation needs?

Verified against: Svelte 5.56.8, Tailwind CSS 4.3.3, tw-animate-css 1.4.0, Motion (motion.dev)
and @formkit/auto-animate 0.10.0 as published on 2026-08-04
Status: one open question — whether `tw-animate-css` itself emits any
`prefers-reduced-motion` guard was not established from a primary source.

## Answer

**No. Svelte's built-ins plus Tailwind cover every case this application has, and no library
closes a gap that is actually open.**

Motion — the library that would otherwise be the default choice — has **no first-party Svelte
package**; it ships React, JavaScript and Vue only, and every Svelte route to it is a
community wrapper. Taking one would put an unofficial adapter between this application and its
animation layer, in a codebase whose dependency surface is deliberately small and which ships
inside an installer.

AutoAnimate is the strongest library candidate on its merits — 3.28 KB gzipped, a genuine
Svelte action, and `prefers-reduced-motion` respected without configuration. But two thirds of
what it does is add/remove, which Svelte's `in:`/`out:` already do, and its third — **move** —
is the one case this repository cannot use at all, because the list shell absolutely positions
its rows. It would be a third mechanism bought for a feature that does not work here.

The accessibility half costs nothing either way: Tailwind ships `motion-safe` / `motion-reduce`
variants, and Svelte 5.7+ exports a `prefersReducedMotion` MediaQuery for the JavaScript side.
Neither needs a dependency.

Two corrections to assumptions that were being made before this was checked, both load-bearing:

- **Svelte transitions are not necessarily main-thread JavaScript.** A transition defined
  through `css` compiles to keyframes that run off the main thread. The per-element cost
  objection applies to `tick`-based transitions, not to the CSS ones.
- **Neither Svelte transitions nor Tailwind handle reduced motion on their own.** It is opt-in
  in both, so "use CSS and it is handled" was false. It has to be written into the standard.

## Findings

- `svelte/motion` exports `prefersReducedMotion`, a `MediaQuery` that matches when the user
  prefers reduced motion, **available since Svelte 5.7.0** — [svelte.dev](https://svelte.dev/docs/svelte/svelte-motion), *svelte/motion exports*. This repository is on 5.56.8, so it is available.
- `svelte/motion` also exports the `Spring` and `Tween` classes, since 5.8.0; the older
  `spring` and `tweened` functions are deprecated in their favour — [svelte.dev](https://svelte.dev/docs/svelte/svelte-motion), *exports list*.
- Svelte's transition documentation **does not mention automatic `prefers-reduced-motion`
  support**; the accessibility behaviour must be implemented by the developer — [svelte.dev](https://svelte.dev/docs/svelte/transition), *prefers-reduced-motion*.
- Svelte transitions are **local by default**, playing only when their own block mounts or
  unmounts; `|global` is required to play when a parent block changes state — [svelte.dev](https://svelte.dev/docs/svelte/transition), *local vs global*.
- A transition returning `css` **"can run off the main thread, preventing jank on slower
  devices"**, and the docs prefer it over `tick` for that reason — [svelte.dev](https://svelte.dev/docs/svelte/transition), *custom transition functions*.
- Transitions dispatch `introstart`, `introend`, `outrostart` and `outroend` events — [svelte.dev](https://svelte.dev/docs/svelte/transition), *transition events*.
- Motion's official documentation lists first-party integrations for **React (`motion-react`),
  JavaScript (`motion`) and Vue (`motion-vue`) only — Svelte is not among them** — [motion.dev](https://motion.dev/docs), *framework list*.
- Every Svelte route to Motion found is community-maintained rather than first-party:
  `epavanello/motion-svelte`, `@humanspeak/svelte-motion`, `micha-lmxt/svelte-motion`,
  `motion.svelte.page` — [search results, 2026-08-04](https://motion.svelte.page/docs). *Secondary — see Limitations.*
- AutoAnimate is **3.28 KB gzipped** at v0.9.0 — [Bundlephobia](https://bundlephobia.com/package/@formkit/auto-animate).
- AutoAnimate's current version is **0.10.0**, published ~17 days before 2026-08-04 — [npm](https://www.npmjs.com/package/@formkit/auto-animate). Still pre-1.0.
- AutoAnimate's root function **works directly as a Svelte action** — `<ul use:autoAnimate={{ duration: 1000 }}>` — [auto-animate.formkit.com](https://auto-animate.formkit.com/), *Svelte usage*.
- AutoAnimate **"respects a user's `prefers-reduced-motion` setting and will automatically
  disable"** — [auto-animate.formkit.com](https://auto-animate.formkit.com/), *accessibility*.
- AutoAnimate animates exactly three events: a child **added**, **removed**, or **moved** — [auto-animate.formkit.com](https://auto-animate.formkit.com/), *what it animates*.
- AutoAnimate degrades where children do not have a settled size — it calls out `flex-grow: 1`
  children specifically, which "wait for the surrounding content before snapping to full
  width", and recommends an explicit width — [auto-animate.formkit.com](https://auto-animate.formkit.com/), *troubleshooting*.
- Tailwind CSS v4 ships `motion-safe` → `@media (prefers-reduced-motion: no-preference)` and
  `motion-reduce` → `@media (prefers-reduced-motion: reduce)`, and recommends `motion-safe` as
  the form requiring less undoing — [tailwindcss.com](https://tailwindcss.com/docs/hover-focus-and-other-states), *motion variants*.
- `tw-animate-css` targets Tailwind CSS v4 with a CSS-first architecture and no JavaScript
  plugin — [github.com/Wombosvideo/tw-animate-css](https://github.com/Wombosvideo/tw-animate-css), *README*.

## Limitations

- **`tw-animate-css`'s own reduced-motion behaviour was not established.** Its README does not
  address `prefers-reduced-motion`, and the `/docs` folder was not read. The standard should
  therefore not assume the 20 generated primitives already honour the preference — that is a
  separate check against the installed package, not a fact this research settled.
- **The Motion community-wrapper list rests on a secondary source** (a search result page), not
  on each project's own documentation. The first-party claim it supports — that motion.dev
  ships no Svelte package — *is* primary and is what the conclusion rests on; the wrapper names
  are indicative only.
- **AutoAnimate's flow requirement was not confirmed in the terms that matter here.** The
  documentation discusses sizing rather than positioning, so "FLIP needs normal flow, therefore
  absolutely-positioned virtualized rows cannot move-animate" is reasoning from how FLIP works,
  not a quoted statement about AutoAnimate. It was not tested against this repository's shell.
- **Nothing was measured.** No bundle, frame-time or scroll-cost figure was taken; the
  performance question was explicitly deferred by the user to a later optimisation pass.
- Bundle size for AutoAnimate is reported at v0.9.0 while the current release is v0.10.0.
