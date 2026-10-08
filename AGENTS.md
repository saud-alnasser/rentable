# rentable

An offline-first desktop tracker for rent payments — a Tauri 2 (Rust) shell around a
SvelteKit 2 / Svelte 5 frontend, with a local SQLite database that replicates to a Turso
account the organization's owner holds. Everything runs in the desktop app.

## Start here

Read `.aep/protocol.md` before anything else. It is the bootstrap; everything else loads
when its `use-when` fires.
