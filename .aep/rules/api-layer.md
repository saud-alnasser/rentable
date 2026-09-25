---
paths:
  - apps/desktop/src/lib/api/**
  - apps/desktop/src/lib/*/router.ts
  - apps/desktop/src/lib/*/reconcile.ts
  - apps/desktop/src/lib/platform/host.ts
  - apps/desktop/src/lib/platform/tauri.ts
  - apps/desktop/src/lib/platform/database/**
use-when: "adding or changing a router, a domain module, a database client or transport, or anything crossing the Tauri IPC boundary"
---

<!--
  Path-scoped: the `paths:` frontmatter above is the authority, and the harness
  enforces it — this rule loads when a file under `apps/desktop/src/lib/api/` is
  read, and costs nothing otherwise. A standard that must hold on every turn belongs in
  `CLAUDE.md` or in an unscoped file beside this one instead.

  The layer is no longer one directory. A concept that has relocated (#123-#126)
  keeps its router under its own name, so the globs follow it there; without them
  the router rules below stop loading for exactly the routers they govern. The two
  `platform` globs are there for the same reason in the other direction: the facade
  and the database transport left the layer, and the `invoke` rule below is the one
  that governs them.

  *One database client type* was merged in here on 2026-08-17, from its own file.
  It was ADR 0001, it governs the same boundary these globs already cover, and
  nothing about it was dropped or reworded — cite it as `[[rules/api-layer]],
  under *One database client type*`.
-->

# API layer

## Where things live

- **Routers validate, call the domain, persist, and reconcile.** A rule that decides
  whether something is allowed belongs in its concept's own module, never inline in a
  procedure. There is no repository layer — routers reach the database directly, and that
  is deliberate — recorded originally as ADR 0002.
- **Input shapes derive from the schema**, by narrowing it. Do not restate fields a router
  is about to persist.
- **Every `invoke` belongs in the Tauri facade**, with the two hot database commands as the
  only exception. A component or router calling `invoke` directly is a defect.
- **Ambient capabilities only in the request context** — the things that cross the process
  boundary or are nondeterministic. Business configuration is not one of them and does not
  belong there.

## Who may call

- **Two procedure kinds, and `member` is the default.** `procedure.member` refuses a machine
  nobody is signed in on; `procedure.public` does not. A procedure written without thinking
  about this should be the safe one, so the safe one is the one you reach for by habit.
- **Host-only is the test for `public`, not harmless-looking.** A public procedure reaches
  `ctx.host` and never `ctx.db`. A read of the workspace is not public however read-only it
  looks, because the workspace belongs to somebody. Today there are fourteen: this machine's
  settings, its updater, what the shell knows about syncing, the organization's consent and
  first run, which happen before there is anybody to act as (`organization/router.ts` argues it),
  what a consented Turso account already holds and the connect onto it, and opening a link of
  either kind, which is how there comes to be somebody (*twelve since
  2026-09-15, counted as every `procedure.public` under `src/lib`, the updater's two in
  `api/app.ts` included; it read nine, which was already short of the eleven the tree then had,
  until effort 826 added `invitation.accept`*).
  *Corrected 2026-09-16 by
  [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]]: the count is fourteen,
  counted the same way, and the three that effort added are each public for a reason already on
  this list. `organization.groupInspect` and `organization.connectExisting` (requirement 14) run
  on a machine that holds nothing, while the consented Turso account is read and the organization
  it already holds is connected to, which is before there is anybody to act as; the password
  crosses in and nothing about it crosses back. `machine.connect` (requirement 20) opens a
  machine-kind link, and it is public for the reason `invitation.accept` is: requiring an identity
  would be requiring the thing the call exists to make possible.*
- **`Context.identity` is `Identity | null`, and `null` is never filled in.** An absent actor is
  absent — never an anonymous, guest, or placeholder user. Decision 03 called a placeholder the
  harder of the two failures, and an absence that is expressible again is exactly when one gets
  invented.

*Why: the refusal used to live in `context()`, which made "nothing reaches the workspace before
there is an account" true by construction. Requirement 9a of
`capabilities-only-one-surface-got` needed the settings page to work on a machine with nobody
signed in, and a context that refused would have refused that page too. Moving the refusal to a
middleware keeps the guarantee and puts it where the question actually belongs: whether a call
needs an acting user is a property of the call.*

## Writes

- **A mutation that touches contracts, payments, or unit assignments must reconcile**, or
  the derived statuses it invalidated stay stale.
- **A mutation that changes workspace state gets the autosync middleware.** Adding the
  procedure and forgetting the middleware is silent — nothing fails, the remote just falls
  behind.

## Errors

**A refusal is a code, and its message is a developer's description.** A request a person could
have made and the domain turns away is thrown as `refuse(code, params?)` from
`src/lib/api/refusal.ts`, which builds the `BAD_REQUEST` and carries `{ code, params }` on its
`cause`; `errorFormatter` copies it into `shape.data` as `refusal`. Nothing shows the message to a
person.

- **The code is named by its concept**, `contract.endBeforeStart`, from the `RefusalCode` union
  that concept declares beside the rules that raise it. `RefusalCode` in `api/refusal.ts` is their
  union. A refusal naming a value carries it in `params`, never spliced into the code.
- **The sentence is the interface's.** `common.refusals.<concept>.<name>` holds one per code in
  both locales, written for the reader in lower case and saying what they must do.
  `error/refusal.ts` turns an error into that sentence (`toRefusalText`), and a type check there
  fails where a code has no sentence or a sentence has no code.
- **A form maps a code to its field** through `fieldOfRefusal`, and never matches the words of a
  message.
- **A procedure's own input schema raises no refusal, and its message is not shown either.** A
  `BAD_REQUEST` tRPC raises for input the schema turned away reads as
  `common.failures.invalidInput`, and a form places it through `fieldOfFailure`, which reads the
  field from the first issue's path where it names one of `RefusalField`.

*Why a code: a sentence written in a router is written in one language, a form placing it has to
match its words, and a reader who switches language holds sentences cached in the one they left.
Revised 2026-09-24 by [[efforts/832-the-interface-speaks-one-language-and-guides/spec]], requirement
23; this read "the message is shown to the user verbatim — write it for them", and the forms
matched fourteen English substrings to place one.*

**A failure that is not a refusal still reads in the reader's language, and never as its
message.** `FORBIDDEN` and `UNAUTHORIZED` are not refusals: the middlewares raise them for a caller
who reached a procedure the interface would not have drawn. Each reads as a sentence of its own,
`common.failures.forbidden` and `common.failures.signedOut`, through `toRouterFailureText` in
`error/refusal.ts`. Any other code reads as the declaration's unexpected sentence or the generic
`common.messages.unexpectedError`. The message stays a developer's: `design/mutation.ts` records it
in diagnostics, and a screen that already offers a details disclosure may show it there, never in
visible text. *Revised 2026-09-25 by ticket 35 of the same effort: this read "they keep surfacing as
a generic failure", and the mutation handler, `toErrorMessage` and `toRefusalText` showed their
English message instead.*

**A rejection from `ctx.host` reaches the caller wrapped.** tRPC turns anything thrown in a procedure
that is not its own error into an `INTERNAL_SERVER_ERROR`, with the Tauri payload as its `cause`.
`error/tauri.ts` reads the code and the reason from there as well as from the error itself.

**The shell refuses the same way, with a reason.** Every refusal a person can cause under the
Rust shell's `organization/` and `sync/` is `Error::Refused { reason }`, the reason one word from
`RefusalReason` in `tauri/src/error.rs`, mirrored by `TAURI_REFUSAL_REASONS` and read as the code
`host.<reason>`, whose sentence is `common.refusals.host.<reason>`. Its message is a developer's
description; where it carries Turso's words a screen shows them behind a details disclosure and
never inside a sentence. A failure nobody can act on keeps its own variant and its generic
sentence, and its message is kept the same way: behind a disclosure where the surface has room,
in diagnostics where it has none, and never beside the sentence (`toErrorText` returns the title
alone). *Revised 2026-09-25 by ticket 37 of the same effort: a toast showed the message as its
description, and `toErrorText` joined it onto the sentence.* *Added 2026-09-24 by the same requirement: the shell's refusals crossed as English prose
the interface showed raw or matched by phrase.*

## One database client type

**Every database client is the same type, and reaches the engine through the same row mapping.**

`createDatabase(single, batch)` in `src/lib/platform/database/client.ts` is the only place a
client is built. Production passes Tauri's `invoke`; tests pass the in-memory engine in
`memory.ts`, which calls that same factory. Both are `SqliteRemoteDatabase<typeof schema>`, and
`Context.db` is typed structurally as that rather than as the app singleton, so a test client
satisfies it too. **Adding a transport means passing different functions to that factory — never
constructing a second kind of client.**

*Why: the proxy row-mapping is real logic sitting on the language boundary, and a test that
skips it verifies a system that does not ship.*

**The condition this rule carried is discharged** *(2026-08-18; the record of what discharged it
corrected 2026-08-19 by #565, and re-read against the tree 2026-08-20 by #573)*. It was flagged in
[[efforts/a-workspace-follows-its-user/spec]] as holding "only if the chosen client can be driven
through that seam".

**What the gate drove was `@tursodatabase/sync`, in Node** — through `createDatabase(single,
batch)`, against a live database, and it went through unchanged. **That is not the client this
application ships**, and this paragraph leads with the fact because the sentence it replaces did
not: it read as though the shipping client had been driven through the seam. The sync engine runs
in the Rust layer behind `db_execute_single_sql` and `db_execute_batch_sql`, so the two functions
the shipping client hands the factory still call `invoke`, and what changed is the engine behind
the command.

**The conclusion the gate bought still holds, and the count is three.** `createDatabase` has three
callers in the tree: `client.ts` with Tauri's `invoke`, `memory.ts` with the in-memory engine, and
`hosted.ts`, which carries a statement to a `@tursodatabase/sync` replica in the webview. **All
three return the same `SqliteRemoteDatabase<typeof schema>`**, which is the property this rule
protects: a transport is a caller at this factory, never a second kind of client. What the move
into Rust costs is a second row mapping, in `tauri/src/database/proxy.rs`, held to the first by a
Rust test rather than by this rule.

> **`hosted.ts` is imported by nothing but its own test** — checked 2026-08-20 while rewriting
> this section. #565 moved the engine into Rust and left the web-layer transport, its test and the
> `@tursodatabase/sync` dependency standing. It is counted above because it is in the tree and
> because its own doc comment cites this rule by name; whether it should still be there is not
> this rule's question, and it is raised rather than answered here.

*The word that went on 2026-08-20 is "hosted": this read "**A hosted workspace is a third caller
at this factory**". There is one kind of workspace, so the qualifier picked it out from nothing.
**The count it carried was right and is kept**, which is the half worth saying out loud: the
qualifier and the count came off the same sentence and only one of them was wrong.*

### Development tooling is excluded, deliberately

`apps/desktop/scripts/seed.ts` and `apps/desktop/scripts/purge.ts` build their own client on
`drizzle-orm/better-sqlite3`
and keep their own use of transactions. They are development tooling, not application code, and
they are not required to adopt the application's client type.

*Why: naming the exclusion is what stops it being read as a violation and "fixed" into one.*

Recorded originally as ADR 0001, *One database client type, shared by tests and production* —
the one decision of the thirty-four that the AEP 2.x transition (63a8811) left without a rule.
Restored 2026-08-17 from `.claude/decisions/0001-one-database-client-type.md` in history, at the
request of [[efforts/a-workspace-follows-its-user/spec]], which leans on it harder than anything
else in the tree.
