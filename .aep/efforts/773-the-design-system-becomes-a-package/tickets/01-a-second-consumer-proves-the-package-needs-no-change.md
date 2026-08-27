---
status: open
---

# test(design): a second consumer proves the package needs no change

Blocked by: the reduction.

Spec: [`.aep/efforts/773-the-design-system-becomes-a-package/spec.md`](https://github.com/saud-alnasser/rentable/blob/main/.aep/efforts/773-the-design-system-becomes-a-package/spec.md). Its *Operational Considerations* and *Open Questions*, second entry, are authoritative.

## Outcome

A second application can consume `@rentable/design` without changing it, demonstrated rather than argued. And the question of what a change to the package does to the release is answered and written where it gets asked again.

## Acceptance Criteria

Traces requirement 10 and requirement 11 of the spec, and its criterion 10
and criterion 11.

- [ ] A throwaway package in this workspace depends on `@rentable/design`, satisfies the string contract with its own strings, imports the token stylesheet, adds its own `@source` line, and renders a button, a dialog and one block. It type-checks.
- [ ] **It is written without touching the package.** A change to `packages/design/` needed to make the consumer work is the finding this criterion exists for: record it, then decide whether it is a defect to fix or a real limit to write down.
- [ ] The consumer is deleted before the branch lands. What survives is the answer and whatever it forced.
- [ ] **The changeset question is answered and recorded in `references/changesets`.** The three candidates are in the spec: the package is versioned in its own right, it never gets a changeset the way `@rentable/control-plane` never does, or a design change gets its changeset written against the applications it reaches. The mechanism that makes this consequential is `privatePackages: {version: true, tag: true}` with `updateInternalDependencies: "patch"` — so versioning the package patch-bumps `@rentable/desktop`, and `references/changesets` records that a tag "is what triggers the signed Tauri artifact build".
- [ ] Whatever is decided, `references/changesets` says it in the same voice as its existing paragraph about the control plane, so the next person reads one rule rather than inferring one.
- [ ] The spec moves to `status: implemented`, and its remaining open questions are either answered or restated as what is still open.
- [ ] `.aep/index.md` is regenerated and `validate.mjs` passes.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build:web` pass from the root.

## Relevant areas

`packages/workspace-permission/` is the shape a minimal consumer package takes here.

`.changeset/config.json` holds `privatePackages`, `updateInternalDependencies` and `access`. Read it rather than trusting the summary above.

`references/changesets` has a paragraph explaining why `@rentable/control-plane` has never had a changeset written for it. That is the paragraph the new one sits beside, and its reasoning — nothing about it reaches a user — is the test to apply.

`.github/workflows/release.yml` is what a tag triggers. Do not run anything in it; read it if the consequence needs confirming.

## Constraints

- **The throwaway consumer is deleted.** `efforts/the-repository-becomes-a-monorepo` did exactly this with a fixture package and it is the precedent. A package left behind is a package somebody maintains.
- **The changeset answer is a decision, so it is the human's.** Put the three candidates and their consequences on the issue, recommend one, and let them choose. Do not pick the safe default and move on; the default exists to cover the gap until somebody decides, not to substitute for deciding.
- **Nothing is published and nothing is pushed.** `gt submit`, `git push` and opening a pull request are the human's call, as always.

## Notes

Acceptance criterion 10 is a proxy and the spec says so. It shows that a consumer written by the person who built the package can use the package; the real test is a consumer written by somebody who was not there, and this effort cannot run it. The residual risk stays on the record rather than being retired by this ticket.

The effort's second risk is that the boundary is being drawn before its second consumer exists, which is the argument `efforts/the-repository-becomes-a-monorepo` used to defer extracting the schema. This ticket is the cheapest available check on whether that argument was right.

No changeset for this effort. Nothing in it is user-visible.
