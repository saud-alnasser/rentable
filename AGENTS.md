# rentable

An offline-first desktop tracker for rents payments — a Tauri 2 (Rust) shell around a
SvelteKit 2 / Svelte 5 frontend, with a local SQLite database and optional Google Drive
backup. There is no server; everything runs in the desktop app.

## Start here

Read `.aep/protocol.md`.

It is the bootstrap: the primitives, where state lives, how to discover what is
relevant, the workflow, and the invariants that hold on every turn. Everything
else loads when its `use-when` fires — nothing here needs to list it.

Nothing about the protocol is restated in this file. A summary in an entrypoint
is a second home for the rules, and it is the copy that drifts.

## About this file

**It is the repository's** — no upgrade will touch it. Extend it with anything that must be
true on every turn and genuinely cannot wait for a rule to load.

Keep that list short. Anything conditional belongs in `.aep/rules/` with a
`use-when`, where it costs nothing until it applies.
