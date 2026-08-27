---
status: resolved
---

# docs(design): a second consumer proves the package needs no change

Blocked by: the reduction.

Spec: [`.aep/efforts/773-the-design-system-becomes-a-package/spec.md`](https://github.com/saud-alnasser/rentable/blob/main/.aep/efforts/773-the-design-system-becomes-a-package/spec.md). Its *Operational Considerations* and *Open Questions*, second entry, are authoritative.

## Outcome

A second application can consume `@rentable/design` without changing it, demonstrated rather than argued. And the question of what a change to the package does to the release is answered and written where it gets asked again.

## Acceptance Criteria

Traces requirement 10 and requirement 11 of the spec, and its criterion 10
and criterion 11.

- [x] A throwaway package in this workspace depends on `@rentable/design`, satisfies the string contract with its own strings, imports the token stylesheet, adds its own `@source` line, and renders a button, a dialog and one block. It type-checks. — `packages/design-consumer-probe/`, a SvelteKit consumer rather than a bare package so that the `$app/*` allowance the spec granted was exercised rather than avoided. It rendered `primitive/button`, `primitive/dialog` and `block/record-surface`, which reads both the contract and `$app/navigation`, and satisfied the contract in French so that a string arriving in a packaged component could only have come from it. `pnpm check`: `COMPLETED 785 FILES 0 ERRORS 0 WARNINGS`.
- [x] **It is written without touching the package.** A change to `packages/design/` needed to make the consumer work is the finding this criterion exists for: record it, then decide whether it is a defect to fix or a real limit to write down. — none was needed. `git status --porcelain` outside the probe reported one path, `pnpm-lock.yaml`, which is the probe's own entry. Three further measurements were taken while it stood: deleting `close` from its contract object failed `check` with `Property 'close' is missing in type ... but required in type 'DesignStrings'`, so the contract binds a consumer the package's author did not write; `vite build` emitted 107,996 bytes of CSS carrying `rounded-2xl`, `text-muted-foreground`, `bg-primary` and `shrink-0`, none of which the probe writes itself; and removing the `@source` line alone took that to 6,141 bytes with every one of those classes gone, which is the token layer's silent-failure claim confirmed on a second consumer rather than on the desktop.
- [x] The consumer is deleted before the branch lands. What survives is the answer and whatever it forced. — deleted, and `pnpm-lock.yaml` restored and reinstalled clean.
- [x] **The changeset question is answered and recorded in `references/changesets`.** — three candidates and their consequences put to the human at [#773](https://github.com/saud-alnasser/rentable/issues/773#issuecomment-5442360372), answered on 2026-08-27: a change to `packages/design/` never carries a changeset naming the package, and a design change a user can observe gets its changeset written against each application that ships it, which today is `@rentable/desktop` alone.
- [x] Whatever is decided, `references/changesets` says it in the same voice as its existing paragraph about the control plane, so the next person reads one rule rather than inferring one. — written beside it, and *When one is not needed* gained the sentence that keeps the two cases apart.
- [x] The spec moves to `status: implemented`, and its remaining open questions are either answered or restated as what is still open. — all four remaining questions answered: the token layer's form, the changeset question, `shell:`, and source-versus-artifact.
- [x] `.aep/index.md` is regenerated and `validate.mjs` passes.
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `pnpm build:web` pass from the root.

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

**One premise the ticket carried turned out to be false, and it did not change the answer.** The ticket and the spec both read `privatePackages: {tag: true}` as meaning a `@rentable/design` tag would trigger the signed artifact build. No such tag can be cut: `release.yml` passes `push-git-tags: false` to the changesets action, and `.github/changeset-tag.cjs` reads `apps/desktop/package.json` by path, so `@rentable/desktop@<version>` is the only tag this repository produces. What made the question consequential survives intact by a different route, since `updateInternalDependencies: "patch"` patch-bumps the desktop off a design bump and the desktop's own tag follows. Both `references/changesets` and the spec's open question carry the correction.

Criterion 11's other half was already true and is now measured. `turbo.json` has listed `packages/design/**` under the `test` task's `inputs` since #774. Appending a newline to `packages/design/src/lib/tone.ts` moved `@rentable/desktop#test`'s hash from `cffd52fff02a7245` to `38234cb35053717d`, so a commit touching only the package re-runs the desktop's tests rather than restoring a cached result.

**The ticket was cut as `test` and lands as `docs`.** The work it asked for was a probe, and the probe is deleted by its own second criterion, so what reaches `main` is the answer the probe gave: a paragraph in [[references/changesets]], the spec's open questions closed, and this file. [[rules/version-control]] makes the branch name the conventional commit the branch lands as, so the type was corrected before submitting rather than after.

No changeset for this effort. Nothing in it is user-visible.
