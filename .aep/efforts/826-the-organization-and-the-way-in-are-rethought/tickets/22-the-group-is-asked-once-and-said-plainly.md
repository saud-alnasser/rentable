---
status: resolved
blocked-by: ['21']
---

# fix(organization): the group is asked once, and said plainly

## Outcome

Where the first run cannot learn the group's name on its own (an empty group not named
`default`, under a token that may not list groups), the walk asks for it as a one-time step
rather than as a refusal: the connect step says beforehand that a group holding nothing yet
will need its name typed once, the name step draws the group field with a calm sentence and
the hint that it is the group picked on Turso's consent screen, and Turso's own refusal is
kept beneath as detail rather than as the headline. Nothing else changes: every other account
still passes through with no field.

## Acceptance Criteria

Traces requirement 13 of [[efforts/826-the-organization-and-the-way-in-are-rethought/spec]] as
corrected on 2026-09-15 and criterion 13, and the human's fourth run.

- [x] The connect step's coverage statements gain a fifth literal in both locales, written
      not copied, saying that a group holding no database yet is asked its name once, on the
      next step, because Turso names it nowhere the application may read; `setup.test.ts`'s
      pinned literals and `i18n/tests/organization.test.ts` follow, and the vocabulary guard
      admits it as a statement about the field and not an instruction to make a group.
- [x] On the name step, when `askGroup` is on, the sentence above the field
      (`groupNeeded`) is rewritten in both locales as a one-time step ("turso could not tell
      rentable which group you picked, so type its name once as it reads on the consent
      screen" or better), the field's description says where the name is found, and Turso's
      last reason is shown beneath the sentence as muted detail (`data-setup-group-detail`)
      rather than as the toast's headline; `setup-walk.svelte.test.ts` asserts the sentence,
      the detail and the field.
- [x] The route keeps the person's name, username and password when the group is asked
      for, so nothing is retyped; asserted in `setup-walk.svelte.test.ts` through the props
      the route hands.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset (`@rentable/desktop`,
      patch) rides with the change.

## Relevant areas

`apps/desktop/src/lib/organization/{setup.ts,component/setup-walk.svelte}`,
`routes/organization/new/+page.svelte`, `i18n/{en,ar}/index.ts`, and the tests beside them.

## Constraints

- **Why**: the human wanted a chooser; a group-scoped consent token may not list groups and,
  on an empty group, cannot even learn the organization's slug, so a chooser would be empty
  exactly when it is needed. The one-time typed name is the honest shape, and the connect
  step saying so beforehand is what keeps it from reading as a failure.
- **No Rust change.** Ticket 21's probes and ticket 18's cascade stand; this ticket is words
  and one detail line.
- **[[rules/interface]]** and the human's direction: minimal, clear language, guides.

## Notes

Built by an implementer and landed on 2026-09-15. Departures: the implementer had the route
raise the create's error toast itself, since `MutationOptions.toast.error` could not decide
per error; the orchestrator folded the proper shape in before landing: `toast.error` may be a
decider over the error answering `true`, a sentence or `null` for a refusal said in place,
`useCreateOrganization` declares one that keeps the group refusal quiet, and the route raises
nothing, asserted in `design/tests/mutation.test.ts`; the connect step's word budget was split
rather than widened, the fifth sentence held against the Rust refusal it replaced;
`groupDetail` clears when a new consent begins.

Raised, not taken: `askGroup` never resets (harmless, Rust refuses a group that is not the
consented one); `groupRequired` left alone; the detail line is the tree's first `dir="auto"`.
