---
status: accepted
---

# Problem

Two numbers on the contract record are drawn by hand where every other surface in this
application draws them through something that knows the locale. In Arabic both come out wrong,
and they come out wrong in different ways, so there is no single thing a reader can learn that
predicts which number on the screen they can trust.

**The unit pane counts in Latin digits.** Its heading reads `المسندة (1)` while every other
count on the same screen reads in Arabic-Indic digits: `١ نتيجة` on the list beside it,
`١٠ نتيجة` on the complex it belongs to. `unit-pane.svelte` interpolates `units.length`
straight into markup, so it renders in whatever digits `toString` produces, which is Latin in
every locale. Both panes are affected; the available pane is invisible in the measurement only
because the contract that was open is locked, which draws one pane rather than two.

**The phone row puts the country code on the wrong end.** It reads `966570493924+` where the
tenant record, the tenant directory and the dashboard all render `+966570493924`. It is the
same number, on the same screen size, in the same locale. The contract record draws it through
a hand-rolled span that inherits `rtl`, and `cell/phone.svelte` — the component that exists for
exactly this — states the rule in its own header: a number carrying a leading `+` is read left
to right in both locales, and letting it inherit `rtl` moves the country code to the wrong end
of the number.

**Neither is a regression from the design package effort.** Both were found by #784's Arabic
pass over the thirteen routes. `git log -L 100,106` on the unit pane returns #457 as the last
commit to touch the line, and `git log -L 224,228` on the contract record returns #399, which
predates the effort by several hundred pull requests. What that effort changed is that it put a
person in front of the screen in Arabic; it is not what broke it.

The cost is the same failure twice, and it is not that a number is ugly. It is that the
application has one rule for how it writes a number and two surfaces that do not follow it,
which means the rule is not enforced by anything and the next surface will be the third.

# Goal

Every number the contract record draws reads the way the same number reads everywhere else in
this application, in both locales, because the record draws it through the same thing every
other surface draws it through rather than through a second spelling of the rule.

# Scope

- The unit pane's two count headings.
- The contract record's phone row.
- A test that catches the next surface written the hand-rolled way.

# Requirements

1. A count rendered by the unit pane reads in the digits the reader's locale uses.
2. The contract record renders a phone number with its country code leading in Arabic.
3. Each number is drawn through the mechanism that already exists for it, rather than through
   a second spelling of the same rule.
4. A phone number rendered under `dir="rtl"` is covered by a test, so the next hand-rolled one
   is caught before a locale is opened.

# Acceptance Criteria

1. `/contracts/[id]?section=units` renders both pane headings with locale digits in Arabic.
2. `/contracts/[id]` renders the phone row with the leading `+` at the start of the number in
   Arabic.
3. The unit pane's count goes through `formatLocaleNumber` in
   `apps/desktop/src/lib/platform/locale.ts`, and the contract record's phone goes through
   `Cell.Phone`, as the tenant record already does. Neither renders a number through string
   interpolation or a hand-rolled span.
4. A component test renders a phone number under `dir="rtl"` and asserts that the country code
   leads.
5. `pnpm check`, `pnpm lint` and `pnpm test` pass.

# Constraints

- **The phone fix is not `dir="ltr"` on that span.** `Cell.Phone` exists, states the rule, and
  carries the `tabular-nums` and `whitespace-nowrap` that go with it. *Why: two spellings of
  one rule is how this happened, and a third spelling does not fix it — it adds a fourth place
  the rule can be got wrong.*
- **Whether the parentheses want localising is answered, not skipped.** They are neutral
  characters next to a number inside a right-to-left heading, which is the same class of
  question the number is. *Why: answering one without the other leaves half a fix and no record
  that the other half was considered.*
- **The packaged `Specification` block does not change.** Both surfaces pass the number into it
  as a snippet, so this is a change to what is passed in.

# Out of Scope

- **The other eleven routes #784 walked in Arabic.** This effort takes the two defects that
  pass were raised for. Anything else it found is its own issue or nothing.
- **Moving `Cell.Phone` into `@rentable/design`.** It is a cell, it knows about this
  application's concepts, and #807 left it in the desktop deliberately.
- **A general audit of every number this application renders.** The requirement is that these
  two go through the shared mechanism, not that the mechanism is proved complete.

# Assumptions

- `formatLocaleNumber` handles a bare count correctly in both locales. It is what the rest of
  the application counts with, so this is believed rather than measured here.

# Risks

- **Criterion 4 needs a component test harness the desktop does not have.** `apps/desktop`'s
  `test` script is `node --import tsx --test` alone; `vitest`, `jsdom` and
  `@testing-library/svelte` are configured in `packages/design` only. Building that harness is
  a requirement of `[[efforts/811-the-gates-and-the-contract-follow-the-code-into-the-package/spec]]`,
  so this effort's fourth criterion is gated on that one landing. The first three are not, and
  can land without it.
