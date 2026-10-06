---
status: open
---

# fix(desktop): the Turso consent keeps listening and trusts only its own callback

Authoritative: [[efforts/854-bugs-and-edge-cases-across-the-app/spec]], and [[efforts/854-bugs-and-edge-cases-across-the-app/plan]] (Part two, *16 + 20*).

## Outcome

The consent callback survives a silent or piecemeal connection and keeps listening; it checks `state` before anything else, leaving the consent open on a stranger's request, and escapes everything it echoes into its page.

## Acceptance Criteria

Traces requirements 16 and 20, and criteria 16 and 20.

- [ ] A reader thread per accepted connection with blocking reads to the end of the headers; a failed connection never settles the consent.
- [ ] `state` is checked first; a mismatch is answered with a neutral page and the consent stays open; `escape_html` on every message.
- [ ] Rust tests per criteria 16 and 20, and a `read_head` test with a request in three pieces.

## Relevant areas

- `apps/desktop/tauri/src/turso/oauth/loopback.rs`
- `apps/desktop/tauri/src/turso/consent.rs`

## Constraints

- [[rules/credentials]]: no code or token in a log line or a page.
- Write the failing test first, at the level `rules/testing` fixes, and see it fail for the defect before the fix ([[skills/tdd]]).
- A changeset for `@rentable/desktop` in a user's words, in the same commit ([[references/changesets]]), unless the change has nothing a user can observe; say so in Notes if none.
