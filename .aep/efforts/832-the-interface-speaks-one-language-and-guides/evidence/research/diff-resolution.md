---

---

# Question

For each [DIFF] in
[[efforts/832-the-interface-speaks-one-language-and-guides/evidence/research/how-the-app-does-each-act-today]],
did a ticket of this effort resolve it, and which one, or is it recorded as a stated exception in
`[[rules/interface]]`, and under which section?

# Sources

- The inventory above, written against `5b0d1480`.
- The effort branch `graphite/docs/832-the-interface-speaks-one-language-and-guides`, read with
  `git log origin/main..HEAD` (and `-S` on the files each line names) on 2026-09-24, at the tip ticket 30 left.
- The source tree at that tip: each line below was checked against the file the inventory named.
- `.aep/rules/interface.md` as ticket 31 leaves it.

# Findings

Each line is the inventory's, in its order. A ticked line names the ticket and commit that
resolved it; a line marked *excepted* names the rule section that states why it stays.

**Search, filter, sort**

- [x] The contract units panes had a bare search input, with no icon, no debounce and no `/`.
  Ticket 14: the panes draw `design/block/search-field.svelte`.
- [x] The unit directory and the payment ledger had no sort. Ticket 30: both hand
  the list shell `sortOptions`.
- [ ] *Excepted.* The dashboard's period picker is a text button while list filters are icon-only.
  Stated in `[[rules/interface]]`, under *Filter*: the chosen period is what the band's figures
  mean, so it is on the control.
- [x] The settings members and workspaces directories did not use the list shell: no search, sort
  or export. Tickets 14 (search and the list bar) and 30 (sort). The
  export they leave out is stated under *Search*.

**Create**

- [x] "+" came from tabler in lists, lucide in settings, and `UserPlus` for members. Tickets 03 (one icon family) and 12 (one create control on every set).
- [x] The dashboard's renew was the only text-labelled row action. Ticket 12: the row
  draws the contract's declared renew act as a record action control.

**Edit**

- [x] A complex was heavy on create and light on edit. Ticket 18.
- [x] Domain submits were text-only while organization and startup submits carried icons.
  Ticket 18.
- [x] Workspaces said "rename", members "rename" and "edit", domain records "edit". Ticket 11: every concept's act is *edit*.
- [x] The unit record page had no edit or delete; only its card did. Ticket 10: the
  page draws the unit's declared acts.

**Delete, confirm, undo**

- [x] The delete dialog also confirmed terminate and restore. Ticket 13: they confirm
  in `confirm-dialog.svelte`, named for their verb.
- [ ] *Excepted.* Deleting the organization is a heavy form with a password, not the dialog.
  Stated in `[[rules/interface]]`, under *Delete and confirm*: nothing undoes it.

**Record actions**

- [x] Cards never offered copy details, the payment card lacked duplicate, and the contract card
  and page differed. Tickets 09 (contract) and 10 (tenant, complex, unit,
  payment): each concept declares its acts once and every surface projects them.
- [x] Edit was `square-pen` in domain code and `pencil` on workspaces. Ticket 03.

**Empty, loading, error, not found**

- [x] The dashboard used a dashed empty with a description, and the unit panes a hand-built
  dashed paragraph. Ticket 16: both draw `empty.svelte`.
- [x] Loading had six treatments. Ticket 15: one `loading.svelte`. The startup
  progress bar stays, and *Loading* states why: it reports the stages of starting, not a read.

**Toasts and callouts**

- [x] Direct toast calls in five files. Ticket 15; `error/tests/toast-reach.test.ts`
  fails on a third importer.
- [x] The contract units lock notice was hand-styled. Ticket 15: an `info` callout.

**Navigation**

- [x] The onboarding screens had their own `back-glyph.svelte`. Ticket 17: gone, and
  every surface draws `back-control.svelte`.
- [x] Record sections used Tabs and settings a hand-built underlined nav. Ticket 17:
  both draw `section-switch.svelte`.

**Status and counts**

- [x] Workspaces used a raw filled dot as its status. Ticket 03: the disc is the cell
  set's (`design/cell/disc.svelte`, which the status treatment draws too), at icon size, with its
  word in the tooltip and the accessible name.

# Conclusion

21 [DIFF]s: 19 resolved by tickets 03, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18 and 30, and 2
excepted in `[[rules/interface]]` (*Filter*, *Delete and confirm*). None is open.

# Not checked

- The app was not run; each line was checked in the source and the commit history, not on screen.
- The inventory's findings not marked [DIFF] (the list's "no results", `+error` offering home only,
  the breadcrumb's non-routes, copy length) are outside this mapping.
- The workspace's edit act opens a sheet titled *rename*, since its one field is the name. The act
  itself reads *edit*, which is what the [DIFF] was about; the sheet title was not changed here.
