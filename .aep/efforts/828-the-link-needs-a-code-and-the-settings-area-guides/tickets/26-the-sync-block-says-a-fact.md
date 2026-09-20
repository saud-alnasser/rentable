---
status: resolved
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

- [x] Rust: the sync store records `last_reached_at` where a pull or push completes, and
      `RemoteSyncState` answers it as `lastReachedAt: number | null`, absent before any went;
      `host.ts` and `tauri.ts` follow; a Rust test finds it written after a completed
      replication and absent before.
      *Verified 2026-09-16 on the effort branch: `RemoteSyncStore.last_reached_at:
      Option<i64>`, persisted, cleared on forget, written through `sync::note_reached` by the
      replicate command's both arms, the push, and the sign-in pull;
      `RemoteSyncState.lastReachedAt: number | null` in `host.ts`; `cargo test --
      --test-threads=1`: `403 passed; 0 failed; 10 ignored`, with
      `the_moment_of_the_last_replication_that_went_through_is_recorded_and_absent_before` and
      `a_record_written_before_the_moment_existed_reads_with_none` ok; `cargo fmt --check`
      clean.*
- [x] `organization/component/standing.svelte` replaces `workspace/component/sync.svelte` at
      the top of the organization section: one sentence from the standing and the moment
      (relative where recent, the date where not, through the application's existing date
      formatting), and beneath it only what the standing calls for (the account refusal's
      sentence and the owner's dashboard control; the credential refusal's sentence; the
      reconnect where the machine holds no authority; the fault's sentence), then one outline
      `check now` control that runs the sync mutation; the badge, its status words, the `sync`
      verb and the workspace sentence go from both locales; the area's test and a
      `standing.svelte.test.ts` assert one sentence per standing with the moment, the control,
      no badge, and no element carrying the word "sync"; the old test goes.
      *Verified: `organization/component/standing.svelte` first in the organization section
      and `workspace/component/sync.svelte` gone; one sentence per standing (`up to date,
      checked 2 minutes ago`; `last reached turso on <date>`; `up to date`; the three that
      need something), then only what the standing calls for, then `check now`; no badge, no
      `syncNow`, `syncStatus*` or `syncDescription` key; `standing.svelte.test.ts` and
      `area.svelte.test.ts`: 37 passed, asserting per standing and locale one sentence, the
      control, no badge, no "sync".*
- [x] The section was run against the human's organization from the run's worktree and the
      human looked at the block before this ticket is resolved; what they said is under Notes.
      *Verified 2026-09-17 over three looks at the dev build from the run's worktree: the
      legend and purpose sentence after the first, the control renamed "sync" after the
      second, then "Looks right, resolve 26".*
- [x] Every sentence in both locales, the Arabic written; `pnpm check`, `pnpm lint`,
      `pnpm test` and `cargo test` pass; the changeset of ticket 03 is extended with one line.
      *Verified in the run's worktree: every sentence in both locales, Arabic written, the
      locale sweep passing (19); at integration three sentences still naming the retired sync
      section and the workspace toast were corrected in both locales; `pnpm check` exit 0
      (desktop `9313 FILES 0 ERRORS 0 WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0
      (desktop `241 passed`); the changeset carries the block's line.*

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

- *2026-09-16, at integration.* Three decisions of the child accepted: a moment older than a
  day reads "last reached turso on <date, time>" rather than claiming up to date; the reconnect
  stays in the Turso account block beneath, the standing pointing at it where both hold; the
  nearest test was the status module's, rewritten for the sentence. Four strings outside the
  block were corrected here: three naming "the sync section", which ticket 25 retired, and the
  check-now toast that spoke of a workspace. Raised, not taken: the refusal clears key on a
  replication that brought or pushed something rather than one that completed, so a quiet
  heartbeat that reached Turso does not clear them (one word, for the close); nothing in Rust
  writes `last_error` today, so the needs-reconnect standing is latent; `note_reached` commits
  the local record on every completed replication, every five minutes.
- *Two looks, 2026-09-16 and 17.* After the first ("add more details about the section it's
  purpose not clear; maybe normal text about this section and description is the current
  status current text") the block took a legend, "this machine and turso", and a purpose
  sentence above the status line. After the second ("check now should be named sync") the
  control was renamed "sync" in both locales at integration, the word tests narrowed to outside
  the control, and requirement 25 and its criterion corrected.
