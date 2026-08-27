---

---

# Question

After 425 files crossed into `@rentable/design`, does every one of the desktop application's
thirteen routes still read correctly in Arabic?

This is acceptance criterion 8's check, and the spec's `# Risks` says why no test can stand in for
it: the i18n inversion fails silently by construction, so a component that quietly stopped
rendering a string it was given still compiles, still renders, and is only visible to somebody
looking at the screen in a locale that would show it.

# Sources

- **The running application**, `pnpm dev` at #784's branch tip, against the local workspace and its
  seeded data: 5,000 tenants, 1,138 contracts, ten complexes. Walked 2026-08-23.
- **The Tauri webview itself**, driven over the Chrome DevTools Protocol with
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`. This is the real shell and
  the real database rather than `pnpm dev:web` in a browser, which cannot reach the Tauri IPC that
  every query in the application goes through and so renders no data at all.
- **The route list**, `find apps/desktop/src/routes -name '+page.svelte'`, which returns exactly
  thirteen and matches the list in #784 one for one.

The locale was set to Arabic through `/settings` rather than by writing the setting, so the change
went through the path a reader's would, and set back to English at the end.

# Findings

**observation — all thirteen routes rendered in Arabic, right to left.** Every one reported
`document.documentElement.lang === 'ar'` and `dir === 'rtl'`, with a non-empty body.
`/contracts/units/[id]` is a 307 to `/contracts/[id]?section=units` by its own `+page.ts`, and it
lands on the units tab with that tab selected and its label in Arabic; arriving at a different
pathname than the one asked for is the route working, not failing.

**observation — no control was left without an accessible name**, on any route. The check
collected every `button`, `a`, and element with a button, link, menuitem, tab or option role, and
looked for one with no text, no `aria-label`, no `title` and no resolvable `aria-labelledby`. Zero
across all thirteen.

**observation — no attribute was handed over as the empty string.** `aria-label`, `title` and
`aria-description` were checked for a present-but-empty value, which is the shape a contract key
resolving to nothing would leave. Zero across all thirteen.

**observation — no left-aligned text on any right-to-left page.** Computed `text-align: left` on an
element with text: zero across all thirteen.

**observation — every left-to-right run was inside a deliberate `dir="ltr"`.** What the walk saw,
on the thirteen routes: the signed-in email address, the `Ctrl K` search hint, phone numbers in
list rows and on the tenant record, the version string on `/settings`, and the diagnostics path
beside it. *This is what those routes rendered, not an inventory of the application: `dir="ltr"`
appears at thirteen sites under `apps/desktop/src`, and two of them are on startup surfaces that
none of the thirteen routes can reach — the progress counter in `startup-loading.svelte` and the
whole `lang="en"` screen in `startup-unreadable.svelte`.*

**observation — the token layer is present on every screen.** Palette, radii and spacing all draw.
This is the check the `@source` risk in `# Technical Risks` wanted: Tailwind v4 excludes
`node_modules` from class detection, so a missing `@source` line renders correct markup with no
styling and reports no error. Unstyled components would have been unmissable and there were none.

**observation — two faults, and neither is this effort's.** Both are filed rather than fixed,
because #784 forbids building anything new on that branch:

| Fault | Where | Last touched |
| --- | --- | --- |
| the contract record puts a phone number's `+` at the wrong end in Arabic | `contract/component/details.svelte:225` | #399 |
| the unit pane counts in Latin digits on a page counting in Arabic-Indic | `contract/component/unit-pane.svelte:103` | #457 |

The first is the sharper of the two, because the rule it breaks is written down eight lines away:
`design/cell/phone.svelte` pins `dir="ltr"` and its header says why, and `tenant/component/details.svelte`
uses that cell. The contract record hand-rolls a span with the locale's direction instead, so the
same number reads `+966570493924` on one record surface and `966570493924+` on the other.

# Conclusion

Criterion 8's walk found nothing that this effort caused. Every surface is whole, every string the
contract supplies arrives, and the direction is right on all thirteen routes.

# Not checked

**Whether any surface's spacing is what it was before the effort.** Nothing was recorded to compare
against, so the walk can say a surface is whole and cannot say it is unchanged. Requirement 8's
"renders identically" is carried by the token layer having moved in one piece at #776 rather than
by this pass.

**Anything not on the thirteen routes.** The startup surfaces, the sign-in wall, the command
palette's own results, and every dialog that has to be opened from a control were not walked. Two
of the thirteen `dir="ltr"` sites are on startup surfaces for that reason.

**Both locales.** The walk was Arabic only, which is what the criterion asks for and is the
direction the inversion put at risk. English was not re-walked.
