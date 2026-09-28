---
status: draft
---

# Problem

The code is organised by concept on paper, and in practice a feature is spread across the shell.
[[efforts/840-a-feature-plugs-in-and-lives-in-one-place/evidence/survey]] is the evidence; the
costs it establishes are these.

- **A feature cannot be added or removed in one place.** Adding a record kind like `tenant` edits
  about 25 files outside its directory by hand, in two languages: the root router, three refusal
  lists, the permission tables in TypeScript and Rust, `RecordKind` restated about five times, the
  cache prefixes, navigation, sidebar, breadcrumb, create, palette, record search, the host mounts
  in `frame.svelte`, the workspace transfer, and both locale files. Removing one costs the same.
  On the Rust side a feature with commands and state touches `lib.rs` and `state.rs` in six to
  eight places plus one line per command.
- **Concepts reach into each other.** Eight two-way import cycles in TypeScript and four in Rust.
  Seven files import another concept's components; no concept has a public entry. `design`,
  `platform` and `api`, the homes meant to own no concept, import concepts. A reader cannot change
  one feature without reading its neighbours.
- **You cannot predict where code lives from what it does.** `layout/` holds the startup
  lifecycle and organization menus beside the shell; `platform/host.ts` is 1,019 lines, most of
  them organization's; `settings/query.ts` holds sync, updates and workspace rename; Rust
  `organization/` is 74% of the crate with one 92-method store and one 49-command file; `sync/` is
  three concepts. Twenty-one TypeScript and Svelte source files pass 500 lines, and four routes
  carry logic every other route keeps in `src/lib`.
- **The same thing is done several ways.** Four of eleven concepts share a shape. Mutations are
  written two ways, routers are exported two ways and mounted at three depths, dates, periods,
  refusals and search each live in two or three places, and Rust carries naming drift, three side
  error enums, `Result<_, String>`, and one test helper copied 28 times.
- **Dead code widens every read.** 169 primitive files and five dependencies nothing uses, a
  package imported by nothing, a transport imported only by its test, dead exports, dead Rust
  fields, and comments describing Google Drive and a control plane that retired.

Each of these makes the next feature slower to write and slower to review, and the i18n files,
`lib.rs`, `platform/host.ts` and `+layout.svelte` are the most-changed files in the repository
because every feature has to edit them.

# Goal

A feature lives in its own directory, declares itself once, and the shell picks it up from that
declaration. Adding a feature means adding a directory and registering it in one place; removing
one means the reverse. Every concept has the same shape, every name says what the thing is, one
thing is done one way, and nothing in the tree is dead. The application behaves exactly as it does
today.

# Scope

The desktop application's TypeScript and Svelte (`apps/desktop/src/`), its Rust shell
(`apps/desktop/tauri/src/`), the design package (`packages/design/`), the packages beside them, and
the `.aep/` rules and contexts that describe the layout.

# Requirements

1. **A record kind is declared once.** Everything the shell knows about a kind — its router, cache
   prefix, route, sidebar place, breadcrumb label, glyph, create entry, palette and search entry,
   host, acts, history concept and transfer columns — is read from the kind's own declaration.
   `RecordKind` and `HistoryConcept` are derived from one list rather than restated.
2. **The shell holds no per-feature list.** `layout`, `api`, `design`, `history` and `workspace`
   iterate what features declare instead of naming them.
3. **The routers compose one way.** Every concept's router is mounted from one list at one depth,
   and every router is exported the same way.
4. **Every concept has a public surface, and nothing reaches past it.** A concept is imported
   through its entry, never through another concept's components or private modules.
5. **No import cycles.** No two concepts import each other, and `design`, `platform` and `api`
   import no concept. The same holds for the Rust crate's top-level modules.
6. **Every concept has one shape.** The canonical layout of a concept is written down, every
   concept follows it, and a sub-concept is a subdirectory rather than a filename prefix.
7. **Each home holds one thing.** `layout` holds only the shell; the startup lifecycle has a home
   of its own; organization and workspace user interface lives in those concepts;
   `settings/query.ts`, `platform/host.ts` and `organization/query.ts` are split so each piece sits
   with the concept it serves; what is cross-cutting (permission) lives in a home that owns no
   concept.
8. **A feature's strings live with the feature.** Adding a feature does not edit a shared locale
   file, and the type check still fails on a key missing from either locale.
9. **A Rust feature registers itself.** Each Rust feature exposes its commands, its state and its
   setup from its own module; `lib.rs` composes features and names no command, and `state.rs`
   names no feature's internals.
10. **Rust `organization/` is split along its sub-concepts**, with a store and commands per
    sub-concept, and the command boilerplate (the signed-in check, the pull, the machine record's
    lock) is done once rather than per command.
11. **The Rust cycle between organization and sync is gone.** The Turso adapter is a module of its
    own, and the machine record does not live inside sync.
12. **The Rust shell's collaborators are injected.** The keyring and the clock are ports a test
    replaces, rather than functions switched by `cfg(test)` or read from the system inside logic.
13. **One pattern per thing.** One way to declare a mutation, one place per concept for queries,
    one date module, one period module, one refusal path, one search path, one shared test
    harness per runner; in Rust, one error type with no side enums and no `Result<_, String>`,
    and one test scratch-directory helper.
14. **Names say what the thing is.** Every file and directory name follows
    [[rules/module-layout]], and the names the survey found ambiguous or drifted are renamed
    (`database/commands.rs`, `organization/migrate.rs` beside `migration.rs`, `earlier.rs`,
    `mark.rs`, `transition/two.rs`, `transition/three.rs`, `organization_consent_*` defined in
    sync, and their TypeScript counterparts).
15. **The upgrade paths for older installs are isolated.** The code that brings 0.12 to 0.15
    installs forward — the earlier records reader, the organization format transitions and
    upgrade, format-one signing, and the old-shape machine record reads — sits behind one clearly
    named module that nothing else depends on, so a later release can remove it in one step.
16. **Dead code is removed**: the 23 unused primitive families with their tests, harnesses and five
    dependencies; `packages/turso-platform`; `platform/database/hosted.ts` with its test and any
    dependency only it used; the four dead exports; the `dead_code` Rust items; comments and
    redaction markers describing retired Google, Drive and control-plane concepts; stale
    `.gitignore`, `turbo.json` and package text.
17. **No file carries more than one concern.** The oversized files the survey names are split
    along the concerns they mix, and routes delegate to `src/lib` as the entity routes already do.
18. **The layout is documented where it is enforced.** The rules and contexts that describe the
    tree describe the new one, and one place says what adding a feature touches.
19. **Behaviour does not change.** Every screen, command, stored format, permission and message
    behaves as it does on `1aa8d6a5`.

# Acceptance Criteria

1. One list of record kinds exists; `RecordKind`, `HistoryConcept` and the stored history
   `concept` enum derive from it, and a search of `src/lib` finds no second declaration of either
   type.
2. A test fails when a file under `layout`, `api`, `design`, `history` or `workspace` names a
   feature by import or by literal kind, outside the one registration list. Adding a record kind
   hand-edits, outside its own directory, only that list, the permission package and its Rust
   mirror, the schema, its routes, and its locale entries — written down per requirement 18.
3. `api/router.ts` mounts every concept from one list at the root; no router mounts another
   concept's router; every router uses one export form.
4. A test fails on an import of another concept's `component/` or of a module the concept does not
   expose through its entry.
5. A dependency check runs in the integration gate and reports zero cycles between concepts and
   zero concept imports from `design`, `platform` or `api`; a Rust test or script does the same for
   the crate's top-level modules.
6. [[rules/module-layout]] states the canonical concept layout; every concept follows it or names
   its deviation there with a reason; `organization` and `contract` group their sub-concepts in
   subdirectories.
7. `layout/` contains no startup, organization or workspace module; `platform/host.ts` contains no
   organization type; `settings/query.ts` holds only settings; permission is imported from a home
   that owns no concept.
8. No shared locale file is edited when a feature's strings change; each concept's strings sit in
   a file of their own; `pnpm check` fails on a key present in one locale and missing in the other.
9. `lib.rs` names no command and no feature's state type; adding a Rust feature with commands and
   state changes at most one line in `lib.rs` and none in `state.rs`.
10. `organization/` has one subdirectory per sub-concept, each with its own store and commands; no
    command repeats the signed-in check, the pull, or the machine record's lock inline.
11. The Turso adapter is a top-level module; `sync` imports nothing from `organization` and
    `organization` imports nothing from `sync`'s internals.
12. No `cfg(test)` or `cfg(not(test))` block switches the keyring's behaviour in production code;
    no production logic outside the clock port reads the system time; tests using the keyring no
    longer serialise on one shared store.
13. A search finds no raw `createMutation` outside the mutation module, no second date, period,
    refusal or search module, one test harness per runner, no Rust `Result<_, String>`, no error
    enum beside `error::Error`, and one scratch-directory helper.
14. Every name in requirement 14 is renamed, and a lint or test enforces the one-word Rust file
    rule and the banned names in [[rules/module-layout]].
15. The upgrade paths sit in one module; no module outside it imports it except the one place that
    runs it at startup; its existing tests pass unchanged in what they assert.
16. None of the items in requirement 16 is in the tree; `pnpm install` leaves no dependency that
    nothing imports; `turbo run test` no longer runs a `turso-platform` task.
17. Each file the survey names as oversized is split along its concerns; `routes/+layout.svelte`,
    `routes/organization/new/+page.svelte`, `routes/organization/join/+page.svelte` and
    `routes/settings/+page.svelte` hold no mutation wiring.
18. `validate.mjs` passes; the rules' `paths:` globs match the new tree; [[contexts/repository]]
    lists the homes as they are; one artifact lists what adding a feature touches.
19. The integration gate passes on every commit of the effort's branch; no workspace migration is
    added; no persisted file, table or column changes shape; the existing tests' assertions are
    unchanged except where they name a moved path.

# Constraints

- **Strictly behaviour-preserving.** The human chose this so review is about structure alone.
  Anything the restructuring turns up that would change behaviour is written down as a follow-up
  effort, never folded in.
- **Every commit leaves the application green.** One effort, one branch, one commit per ticket
  ([[rules/version-control]]); each ticket is a move that passes the integration gate on its own,
  because a restructuring that breaks the build between commits cannot be reviewed commit by
  commit or bisected.
- **Stored values keep their spelling.** The history `concept` values, the permission bit layout,
  the machine record's serde names and every table and column are data at rest; the refactor
  moves the code that names them and never the names.
- **Routers still reach the database directly.** "Adapter" here means the seam a feature plugs in
  through, not a repository layer; [[rules/api-layer]] records that decision and this effort does
  not revisit it.
- **The rules move with the code.** Where a rule describes the old layout, the commit that changes
  the layout rewrites the rule, so the tree and its description never disagree on `main`.
- **SvelteKit fixes where routes live**, so a route file stays under `src/routes/` and delegates.

# Out of Scope

- Any user-visible change: a screen, a message, a flow, a shortcut.
- New features, and bug fixes found along the way.
- A repository or data-access layer between routers and the database.
- The schema, the migrations, and the permission bit layout (decision 04's migration).
- Removing the upgrade paths for 0.12 to 0.15 installs; requirement 15 isolates them only.
- Generating the Rust flag table from the TypeScript one; the parity test that holds them together
  stays.
- Replacing a library (typesafe-i18n, tRPC, superforms, drizzle, shadcn-svelte).
- Moving the application's own blocks (`design/block/list.svelte` and its neighbours) into the
  design package, or curating the package's `./*` export.
- Route URLs.
- CI and release workflows, beyond dropping the removed package's task.

# Assumptions

- The tRPC procedure paths that change when `payment`, `dashboard`, `settings`, `remoteSync` and
  `organization` mount at the root are not persisted anywhere. Checked for history: it stores a
  render key, not a procedure path (`platform/database/schema.ts:221-232`), and undo lives in the
  session. Not checked for diagnostics or anything the Rust side records.
- typesafe-i18n can compose per-concept files into one locale with the parity check intact.
  Unverified; `/plan` settles how.
- `generate_handler!` can be fed from per-feature modules without listing every command in
  `lib.rs`. Unverified; `/plan` settles how.
- The unused primitive families can be re-added by the shadcn-svelte CLI if ever needed, so
  deleting them loses nothing.
- Removing `@tursodatabase/sync` from the web layer, if `hosted.ts` is its only user, does not
  affect the Rust engine, which uses the crate.

# Open Questions

- How far the Rust store split goes: one store per sub-concept over one shared connection, or one
  `OrganizationStore` whose methods move into per-sub-concept modules. Structural, so it is
  `/plan`'s to settle.

# Risks

- **Size.** This touches most of the tree: about 82k lines of Rust and 40k of TypeScript. A
  ticket that moves too much at once is unreviewable. The plan has to cut moves small enough to
  read, and the sequence has to keep every commit green.
- **A moved rule stops loading.** The rules load by `paths:` glob; a directory that moves without
  its glob silently turns off the rule that governs it. It would show as a reviewer finding a
  convention broken in a moved file.
- **A behaviour change hidden in a move.** A split that reorders side effects (a lock, a pull,
  a reconcile) changes behaviour while every file looks the same. The existing tests are the net;
  where a moved path has no test, the move needs one first.
- **Work in flight conflicts.** Any other effort opened while this one runs edits files this one is
  moving.
