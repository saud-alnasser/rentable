---
status: resolved
blocked-by: [55]
---

# fix(organization): review round two of the workspace layer is settled

## Outcome

Review round two of ticket 55 found three faults and a stale comment, and no third round follows,
so the orchestrator settles them here.

- **A pin the act refused.** The card never pins a write that its kind's view hides, but the act
  judged every write the layers beneath carry. Turning a kind's view off beside writes the role
  carries was therefore refused, with nothing said beforehand.
- **A read-only grant lifted too early.** A grant minted read-only was lifted to full access before
  the pins that keep its other writes off, so a refused pin left the member with every write.
- **Switching back to the role by hand** is the reset, and clears every workspace's pins with it,
  but it was not refused where the reset is.

## Acceptance Criteria

Traces requirement 12, and requirement 6, of [[efforts/838-permissions-are-a-role-and-an-override/spec]].

- [x] The act refuses only a write turned on there without its view, in Rust and at the router; a
      view pinned off beside the writes the role carries is accepted; tests in both languages.
- [x] A read-only grant is lifted after that workspace's pins are written, and not where they are
      refused; a test.
- [x] A switch that brings the override back to the role is refused where the reset is, saying
      why; a test.
- [x] The router test's comment says what the test now does.
- [x] `cargo test`, `pnpm check`, `pnpm test` and `pnpm lint` pass.
