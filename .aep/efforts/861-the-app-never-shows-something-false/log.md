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

## Rounds

converge 1: gap, tickets 15 16 17
converge 2: no gap
review 1: 9 findings: 6 fixed (stale retrying, reconcile rule and repository context, renewed helper, form changeset, layout stand-in, comment wrap), 3 ticketed (18 heal, 19 failed list toolbar, 20 import link)

## Recorded

- opened in the full lane, from main, the current branch, because rules/version-control sets stack: true
- 03: after try again the failed block shows no sign of work while the read reruns; weigh at converge
- 05: the human chose to leave out a figure the member may not view (no card, no ring unless due and collected are both known, no nothing-to-chase without view-contracts), over keeping zeros or a marked placeholder
- seam after 11: the ticket 09 section comment in contract/tests/router.test.ts still says nothing writes the link
- converge: rules/interface Form surface could name seed (schema forms) and isDirty (the others) as how a form reports its changes
- converge: 05 shows an empty landing screen to a member who may view none of contracts, payments or units; the money card links to /contracts when only collected is shown

## Needs you

- ticket 02: in the running app, an error toast is still up after ten seconds, closes from its X, and sits bottom-left in Arabic and bottom-right in English
- ticket 01: judge the new primary, destructive and permitted fills in the running app, light and dark (buttons, badges, a selected day, a checked box, the rail mark)
- ticket 06: on real forms, the discard question opens with keep editing focused and its focus ring showing
- ticket 07: in the running app, the contract form (edit, renew, duplicate), the tenant form and the payment form close at once when untouched and ask after a field changes
- converge: a member who may view none of contracts, payments or units now sees an empty landing screen; say what it should show, if anything
- changelog: the renewal features (renew may change the rent, an export carries the link, earlier renewals recognised) are patch; say if they should be minor
