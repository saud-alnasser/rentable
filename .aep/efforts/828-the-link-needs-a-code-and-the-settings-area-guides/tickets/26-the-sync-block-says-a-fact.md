---
status: open
blocked-by: ['25']
---

# feat(settings): the sync block says a fact

## Outcome

At the top of the organization section one block says, in a sentence, where this machine
stands with the organization on Turso: up to date with when it last reached Turso, reached once
with that moment, or one of the standings that need something, said as what needs doing with
the sentence and control that exist for it; one "check now" control; no badge, no status word
alone, and the word "sync" nowhere a person reads. The moment of the last replication that went
through is recorded on this machine.

## Acceptance Criteria

Traces requirement 25 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 25
and 12.

- [ ] Rust: the sync store records `last_reached_at` where a pull or push completes, and
      `RemoteSyncState` answers it as `lastReachedAt: number | null`, absent before any went;
      `host.ts` and `tauri.ts` follow; a Rust test finds it written after a completed
      replication and absent before.
- [ ] `organization/component/standing.svelte` replaces `workspace/component/sync.svelte` at
      the top of the organization section: one sentence from the standing and the moment
      (relative where recent, the date where not, through the application's existing date
      formatting), and beneath it only what the standing calls for (the account refusal's
      sentence and the owner's dashboard control; the credential refusal's sentence; the
      reconnect where the machine holds no authority; the fault's sentence), then one outline
      `check now` control that runs the sync mutation; the badge, its status words, the `sync`
      verb and the workspace sentence go from both locales; the area's test and a
      `standing.svelte.test.ts` assert one sentence per standing with the moment, the control,
      no badge, and no element carrying the word "sync"; the old test goes.
- [ ] The section was run against the human's organization from the run's worktree and the
      human looked at the block before this ticket is resolved; what they said is under Notes.
- [ ] Every sentence in both locales, the Arabic written; `pnpm check`, `pnpm lint`,
      `pnpm test` and `cargo test` pass; the changeset of ticket 03 is extended with one line.

## Relevant areas

`apps/desktop/tauri/src/sync/{store,command,mod}.rs`, `apps/desktop/src/lib/platform/{host,tauri}.ts`,
`apps/desktop/src/lib/workspace/{sync-status.ts,component/sync.svelte}` and its test,
`apps/desktop/src/lib/organization/component/standing.svelte` (new),
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The sync
  block says a fact*.**
- **The standings and their order are `sync-status.ts`'s**; this reshapes what is drawn, not
  what is decided.
- **Plain words, short lines**; the look is judged on the real organization, and the human is
  at the machine, so ask before driving the application.

## Notes
