---
status: resolved
blocked-by: [13, 14, 15]
---

# docs(desktop): the rules and the comments follow the flags

## Outcome

Converge, round 1: what the effort falsified is corrected in the effort. `rules/interface` still
describes `member-acts.svelte` under *Form surface* and "a member's role (two)" under *Field kinds*,
and its *Record card actions* does not name the act's `flag`; `rules/api-layer` *Who may call*
describes two procedure kinds and counts member procedures; `api/context.ts` and `api/trpc.ts` say
forty-six of the procedures are member procedures; `workspace/component/permitted.svelte` says every
act on a workspace is administrative. After this, each says what the code does.

## Acceptance Criteria

Traces requirements 1 and 10 of [[efforts/838-permissions-are-a-role-and-an-override/spec]], and criterion 1.

- [x] `rules/interface` describes the member card's role picker and override editor, the role field
      as a choice among the organization's roles, and the act's `flag` under *Record card actions*.
- [x] `rules/api-layer` *Who may call* names `procedure.permitted`, `permittedAny` and `permittedBy`,
      the meta the router walk reads, and when a procedure is `member` or `public`, with a count that
      matches the walk.
- [x] The comments in `api/context.ts`, `api/trpc.ts` and `permitted.svelte` say what the code does.
- [x] `node .aep/scripts/index.mjs` and `validate.mjs` pass; `pnpm lint` passes.

## Relevant areas

- `.aep/rules/interface.md`, `.aep/rules/api-layer.md`
- `src/lib/api/context.ts`, `src/lib/api/trpc.ts`, `src/lib/workspace/component/permitted.svelte`

## Constraints

- A rule states the present and marks what it replaced, in the repository's italic history form.
