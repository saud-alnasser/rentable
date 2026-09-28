---
status: resolved
blocked-by: [45, 46]
---

# fix(desktop): review round two of the switches is settled

## Outcome

Review round two of tickets 45 and 46 found one fault and no third round follows, so it is settled
here by the orchestrator. Ticket 46 set the application's own create action to *add*, relabelling
every create form's submit and the palette, and left the permission verb reading *create*. A role
refused for a flag in the member card's picker used the platform's disabled, so its reason never
reached the keyboard. The Arabic reason naming holders who would write blind did not agree with
several of them, and the research's recommendations still named `coins` for payments.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] `common.actions.create` reads create again in both languages and `flagVerbs.create` reads
      add; a test checks the words, not only the keys.
- [x] A role refused for a flag is `aria-disabled` with its reason and the pick is refused, as
      `rules/interface` asks of a refused control; a role out of rank reach is disabled as before.
- [x] The Arabic holders sentence reads for one holder or several; the research's recommendations
      point at the banknote correction.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass; `cargo test` passes.

*Not taken: the interface's foresight counts a holder whose row is uncovered, which Rust skips;
that row is a tampered one, whose way on is removal, and the refusal is the safe side.*
