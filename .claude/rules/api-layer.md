---
paths:
  - src/lib/api/**
  - src/lib/*/router.ts
  - src/lib/*/reconcile.ts
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when a file under `src/lib/api/` is read and
  costs nothing otherwise. A standard that must hold on every turn belongs in
  `CLAUDE.md` or in an unscoped file beside this one instead.

  The layer is no longer one directory. A concept that has relocated (#123-#126)
  keeps its router under its own name, so the globs follow it there; without them
  the router rules below stop loading for exactly the routers they govern.
-->

# API layer

## Where things live

- **Routers validate, call the domain, persist, and reconcile.** A rule that decides
  whether something is allowed belongs in its concept's own module, never inline in a
  procedure. There is no repository layer — routers reach the database directly, and that
  is deliberate: [ADR 0002](../decisions/0002-no-repository-layer.md).
- **Input shapes derive from the schema**, by narrowing it. Do not restate fields a router
  is about to persist.
- **Every `invoke` belongs in the Tauri facade**, with the two hot database commands as the
  only exception. A component or router calling `invoke` directly is a defect.
- **Ambient capabilities only in the request context** — the things that cross the process
  boundary or are nondeterministic. Business configuration is not one of them and does not
  belong there.

## Writes

- **A mutation that touches contracts, payments, or unit assignments must reconcile**, or
  the derived statuses it invalidated stay stale.
- **A mutation that changes workspace state gets the autosync middleware.** Adding the
  procedure and forgetting the middleware is silent — nothing fails, the remote just falls
  behind.

## Errors

User-facing validation failures are raised as a `BAD_REQUEST`, and the message is shown to
the user verbatim — write it for them, in lower case, saying what they must do. Any other
code is treated as unexpected and surfaces as a generic failure.
