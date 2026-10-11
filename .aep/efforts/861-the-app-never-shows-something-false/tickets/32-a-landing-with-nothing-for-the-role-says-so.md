---
status: resolved
---

# feat(desktop): a landing screen with nothing for the reader's role says so

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 2: the app states no figure it does not know). The owner's answer to the converge question on staged state 12: the empty landing should say in its middle what is happening.

## Outcome

A member whose role may view none of contracts, payments and units sees, in the middle of the landing screen, that nothing on it is open to their role, what it shows, and who can change that.

## Acceptance Criteria

Traces requirement 2.

- [x] The screen says it in its middle. Verified: staged state 12 shows the title and the line centred in the window in English and Arabic, light and dark; the empty block takes a fifth kind, `not-permitted`, and the landing frame fills the window while still growing with what it holds.
- [x] Only where the reader may view none of it, and only under a read that answered. Verified: `landing.svelte.test.ts` holds that a reader without contracts, payments and units is told so and not *nothing to chase*, and a reader who may view payments alone is not told it; 25 of 25 pass.

## Relevant areas

- apps/desktop/src/lib/dashboard/component/landing.svelte, apps/desktop/src/lib/dashboard/i18n/(en.ts, ar.ts), apps/desktop/src/routes/+page.svelte, packages/design/src/lib/block/empty.svelte, .aep/rules/interface.md
