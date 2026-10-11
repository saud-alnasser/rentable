---
use-when: "resuming this effort, or asking where it stands"
---

# Run log: 861-the-app-never-shows-something-false

## Ledger

[x] 02 error-toasts-stay-and-mirror 4/4
[x] 06 the-form-surface-asks-before-discarding 4/4
[x] 01 labels-on-fills-read-in-both-appearances 3/3
[x] 03 a-failed-list-read-says-it-failed 5/5
[x] 09 a-contract-can-name-what-it-renews 4/4
[x] 08 the-other-forms-report-their-changes 3/3
[x] 04 a-failed-record-read-says-it-failed 2/2
[x] 12 reconcile-links-the-renewals-it-did-not-record 4/4
[x] 11 renewing-records-the-link-and-may-change-the-rent 4/4
[x] 07 the-schema-forms-report-their-changes 3/3
[x] 05 the-landing-screen-states-no-figure-it-does-not-know 2/2
[x] 10 merging-copies-keeps-the-renewal-link 2/2
[x] 14 an-export-carries-the-renewal-link 3/3
[x] 13 a-renewed-contract-is-not-up-for-renewal 5/5
[x] 17 the-interface-rule-names-how-a-form-reports-its-changes 2/2
[x] 16 the-money-card-links-only-where-the-member-may-go 2/2
[x] 15 try-again-shows-it-is-trying 3/3
[x] 19 a-failed-list-offers-no-create-and-no-export 3/3
[x] 20 an-import-writes-only-a-renewal-link-that-can-stand 3/3
[x] 18 copies-pair-when-one-alone-names-what-it-renews 3/3
[x] 24 a-toast-reads-on-its-wash-in-both-appearances 2/2
[x] 21 a-failed-members-read-on-the-workspace-page-says-it-failed 2/2
[x] 23 an-edit-keeps-a-renewal-after-what-it-renews 3/3
[x] 22 the-band-never-shows-another-periods-figures 2/2
[x] 25 the-interface-runs-staged-on-mock-data 6/6
[x] 26 a-staged-state-is-stepped-through-on-a-bar 4/4
[x] 29 a-date-picker-reads-in-arabic-and-a-chosen-day-is-round 2/2
[x] 27 every-effort-hands-its-on-screen-checks-over-staged 3/3
[x] 28 this-efforts-on-screen-checks-are-staged 3/3
[x] 30 an-error-toast-closes-from-its-x-over-an-open-form 2/2
[x] 31 staging-opens-in-the-desktop-window 4/4
[x] 32 a-landing-with-nothing-for-the-role-says-so 2/2
[x] 33 a-toasts-action-is-drawn-in-its-tone 2/2

## Rounds

converge 1: gap, tickets 15 16 17
converge 2: no gap
review 1: 9 findings: 6 fixed (stale retrying, reconcile rule and repository context, renewed helper, form changeset, layout stand-in, comment wrap), 3 ticketed (18 heal, 19 failed list toolbar, 20 import link)
review 2: 8 findings: 3 fixed (repository context on the heal, the act rule on create, comment wrap), 4 ticketed (21 to 24), 1 for the human (read-only members held by 0009)

## Recorded

- opened in the full lane, from main, the current branch, because rules/version-control sets stack: true
- 03: after try again the failed block shows no sign of work while the read reruns; weigh at converge
- 05: the human chose to leave out a figure the member may not view (no card, no ring unless due and collected are both known, no nothing-to-chase without view-contracts), over keeping zeros or a marked placeholder
- seam after 11: the ticket 09 section comment in contract/tests/router.test.ts still says nothing writes the link
- converge: rules/interface Form surface could name seed (schema forms) and isDirty (the others) as how a form reports its changes
- staging: the layers rule leaves prototype/stage/ out as it leaves tests/ out; the database-client rule is kept, the stage telling the plugin's two commands apart by their arguments
- staging found 29 (calendar header and edge day) in ticket 01's state; fixed in the effort
- staging: Edge synced the owner's extensions into the stage window's fresh profile, and a dark mode one repainted light; the window and the shots now run with extensions and sync off
- the owner, on the staged error toast: its X moves to the top end corner, where the reading ends; the provider test reads the toaster's properties, and only the staged shot shows where the X lands
- staging: the owner pressed the staged error toast's X and nothing happened; found 30 (a modal dialog's pointer-events reached the toaster), fixed in the effort
- staging: the launcher is `pnpm stage:open`, since pnpm 12 answers the bare `pnpm stage` with its own publish-staging command; found at the hand-off
- the owner, on staging: open it as the app's desktop window, from development only, with no entry code changed; found 31. The shell's IPC cannot be mocked, so the application's own `@tauri-apps/api/core` resolves to a staged `invoke`, and the shell runs under its own identifier
- the owner, on staged state 12: the empty landing says in its middle what is happening; found 32
- the owner, on the staged landing message: it speaks of permissions, not roles, in both languages
- the owner, on the staged undo toast: its undo and redo look plain; found 33, staged as state 13
- converge: 05 shows an empty landing screen to a member who may view none of contracts, payments or units; the money card links to /contracts when only collected is shown
- the owner, 2026-10-11: every staged on-screen check accepted (states 1 to 13); migration 0009 stays `readers_need: true`, as the plan chose; the changesets stay `patch`

## Needs you
