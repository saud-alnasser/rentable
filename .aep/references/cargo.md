---
use-when: "running, building, or testing the Rust crate in apps/desktop/tauri/"
---

# cargo (Rust side)

The Rust crate lives in `apps/desktop/tauri/`, not at the repository root, so **every cargo command
needs `--manifest-path ./apps/desktop/tauri/Cargo.toml`** or it will not find a crate. Edition 2024.

Docs: <https://doc.rust-lang.org/cargo/commands/cargo-test.html>. Fetch for feature
selection, target filtering, or anything about the build profile.

## Run every Rust test

```bash
pnpm test:rust
```

At the root that is `turbo run test:rust`, which runs the desktop package's own script —
`cargo test --manifest-path ./tauri/Cargo.toml -- --test-threads=1`, whose path is relative to
`apps/desktop/`. **The manifest path a command needs depends on where it is typed**, which is why
the two spellings differ; the ones written out in this file are the ones for the repository root.

**`--test-threads=1` is required.** These tests touch the filesystem and are not isolated
from one another; running them in parallel produces failures that look like real bugs.

## Run one test

```bash
cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml manifest_entries_for_deleted -- --test-threads=1
```

The bare argument is a substring match on the test path, not a regex.

## Check without building

```bash
cargo check --manifest-path ./apps/desktop/tauri/Cargo.toml
```

Much faster than a build when the question is only whether it compiles. Note that neither
`pnpm check` nor `pnpm lint` covers Rust — nothing in the frontend gate will catch a Rust
compile error.
