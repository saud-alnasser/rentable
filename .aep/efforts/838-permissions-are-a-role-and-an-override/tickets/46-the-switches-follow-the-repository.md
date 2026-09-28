---
status: resolved
blocked-by: [45]
---

# fix(desktop): the switches and cards follow the repository's rules

## Outcome

Review round one of tickets 42 to 44, standards. Payments are drawn with a second glyph; the switch
verbs duplicate `flagVerbs` and call creating *add* where refusals say *create*; spacing is off the
ladder; record kinds are defined twice; the group heads are raw labels in lower case; two comments
and the router's refusal codes say what the rules do not; and the organization context, the
interface rule and the plan describe the code before these tickets. After this, each follows its
rule.

## Acceptance Criteria

Traces requirement 12 of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] Payments are drawn with `banknote`, the glyph they already have; the plan and the research's
      observation say so.
- [x] One verb set: `flagVerbs.create` reads *add* in both languages, and the switches and level
      words read `flagVerbs`; the duplicate keys go.
- [x] `gap-y-0.5` becomes a ladder step; group heads use `Field.Label` and render in sentence case.
- [x] `role.ts` takes `RECORD_KINDS` and `RecordKind` from the package.
- [x] The dimmed switch's tooltip and the header read one string, and `levelWord`'s doc says what
      uses it.
- [x] `rules/api-layer` *Errors* states that the organization router raises the shell's
      `host.*` codes for acts it foresees, and why.
- [x] `contexts/desktop/organization` says a new role and a deleted role clear the override and
      that writing a kind needs viewing it; `rules/interface` names the switch list; the plan's
      *Permissions as switches* says what was built.
- [x] `pnpm check`, `pnpm test` and `pnpm lint` pass.

## Relevant areas

- `src/lib/organization/glyph.ts`, `role.ts`, `component/permission-switches.svelte`,
  `component/roles.svelte`, `src/lib/i18n`, `.aep/rules/api-layer.md`, `.aep/rules/interface.md`,
  `.aep/contexts/desktop/organization.md`, the effort's `plan.md` and research file
