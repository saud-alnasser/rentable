---

---

# Question

If the Turso embedded-replica sync engine runs in this application's Rust layer instead of
its JavaScript layer, **which crate delivers it, and can that crate coexist with the `sqlx`
SQLite already in the binary?**

Asked because `@tursodatabase/sync` 0.7.2 — chosen in decision 10, validated live in decision
11 — turned out to be a native NAPI addon that cannot run in a WebView2 with no Node, and the
human directed the engine into the Rust layer behind the existing Tauri `invoke` commands.

# What decision 01's evidence already settles, and is not re-derived here

[[efforts/a-workspace-follows-its-user/evidence/research/libsql-embedded-replica-guarantees]]
(2026-08-13, extended 2026-08-17) already establishes, and this file takes as given:

- A default `@libsql/client` embedded replica is **read-only when disconnected**; `offline: true`
  is the legacy path Turso steers away from; `@tursodatabase/sync` is the vendor's recommendation
  for offline writes, with **last-push-wins** conflict resolution (§1).
- Turso Cloud's credential model, revocation granularity, migration path, per-database quotas,
  and the per-commit added-latency ceiling (§3–§6).
- §7 (2026-08-17): in `libsql-js` 0.5.29 / Rust `libsql` 0.9.30, the `offline: true` branch
  silently drops `syncInterval` and `encryption_config`, and `PushStatus::Conflict` returns
  `SyncError::InvalidPushFrameConflict` with **no library-provided recovery path**.

That file is about the JavaScript clients and the `libsql` engine. **It says nothing about a
Rust crate in this binary**, nothing about linking against `sqlx`, and nothing about the
`turso` crate's own API. Those are what this file establishes.

# Sources

All read **2026-08-19** unless stated. Primary unless marked.

| # | Source | What it is |
| --- | --- | --- |
| S1 | crates.io API — `/api/v1/crates/turso`, `/turso/0.8.0-pre.4`, `/turso/0.7.2`, `/turso/*/dependencies`, and the same for `turso_core`, `turso_sdk_kit`, `turso_sync_sdk_kit`, `libsql`, `libsql-ffi`, `libsql-sys`, `libsqlite3-sys` | registry metadata — versions, dates, features, dependency edges |
| S2 | Published crate tarballs from `static.crates.io`: `turso` 0.7.2 and 0.8.0-pre.4, `turso_core` 0.8.0-pre.4, `turso_sync_engine` 0.8.0-pre.4, `turso_sync_sdk_kit` 0.8.0-pre.4, `libsqlite3-sys` 0.37.0, `libsql-ffi` 0.9.30 | **the crates' own source**, exactly as a build would consume them |
| S3 | `@tursodatabase/sync` 0.7.2 as installed in this repository's worktree — `package.json`, `dist/promise.js` | the shipped package decision 11 measured |
| S4 | `apps/desktop/tauri/Cargo.toml`, `apps/desktop/tauri/src/database/migrations.rs` | this repository |
| S5 | **Empirical builds run here**, Windows 11 Pro 26200, `cargo 1.97.1` / `rustc 1.97.1`, x86_64-pc-windows-msvc. Throwaway crates under the session scratchpad; **nothing in this repository was touched** | observation, not a source |
| S6 | `docs.turso.tech` — `/sdk/rust/quickstart`, `/sdk/rust/reference`, `/sdk/introduction`, `/sync/usage`, `/sync/conflict-resolution`, `/sync/checkpoint`, `/sync/partial`, `/turso-cloud`, `/sdk/authentication` | Turso's own reference documentation |
| S7 | `github.com/tursodatabase/turso` — README FAQ, `bindings/rust/README.md`, `bindings/rust/Cargo.toml` | the repository that owns the crate |
| S8 | `docs.rs/turso/0.7.2` | generated API documentation |
| S9 | `github.com/tursodatabase/turso` at `main`, HEAD `700adf85` (2026-08-18) — `COMPAT.md`, `docs/`, `core/io/`, `core/storage/wal.rs`, `.github/workflows/rust.yml`, the issue tracker and its git log | the project's own compatibility statements, source, CI and defect record |
| S10 | `github.com/rustls/hyper-rustls` at tag `v/0.27.9` — `Cargo.toml`, release notes, issues #280 and #288; `rustls` 0.23 `crypto/mod.rs`; `aws-lc-rs` requirements docs | the crates that decide the TLS stack |
| S11 | `sqlite.org/fileformat2.html`, `sqlite.org/howtocorrupt.html` | SQLite's own specification |
| — | `turso.tech/blog/sync-benchmark`, `turso.tech/blog/we-will-rewrite-sqlite…` | **secondary write-ups. Not opened, not relied on for any claim below.** |

Sources S9–S11 were gathered by a delegated sweep; every claim drawn from them carries its
URL, issue number or file path so it can be re-walked. Where a finding was **also** reproduced
by a build here it says so, and that reproduction is the stronger evidence.

# Findings

## 1 — Which crate, and is it real today

**source.** The crate is **`turso`** on crates.io, described "Turso Rust API", repository
`github.com/tursodatabase/turso`, MIT, published by `penberg`. First published **2025-07-01**.
As of 2026-08-19: **max stable `0.7.2`, published 2026-07-30**; **max version `0.8.0-pre.4`,
published 2026-08-11**; 733,239 downloads all-time, 469,810 recent. (S1)

**source.** Sync is **not in default features**. `turso` 0.7.2 and 0.8.0-pre.4 both declare
`default = ["mimalloc", "fts"]` and a separate
`sync = ["dep:hyper", "dep:tokio", "dep:hyper-rustls", "dep:hyper-util", "dep:http-body-util", "dep:bytes"]`. (S1)

**source.** The vendor points Rust applications here explicitly. `turso_sync_sdk_kit`
0.8.0-pre.4's crates.io description reads: *"Low-level C ABI for Turso Cloud sync in language
bindings. **For Rust applications, use the `turso` crate instead.**"* `turso_sdk_kit` carries the
same sentence. (S1)

**source.** `turso` 0.8.0-pre.4's normal dependencies are `turso_core`, `turso_sdk_kit`,
`turso_sync_sdk_kit`, `thiserror`, `tracing`, `tracing-subscriber`, plus the six optional crates
the `sync` feature turns on. `turso_sync_sdk_kit` depends on `turso_sync_engine` — that is where
the sync protocol lives. (S1)

**source.** `docs.turso.tech/sdk/introduction` names it in its SDK matrix: *"**Local database +
cloud sync** (push/pull) … Rust: `turso` (with `sync` feature)"*. `/sdk/rust/quickstart` shows
`turso::sync::Builder::new_remote` with `push()`/`pull()` and asserts *"All reads and writes
happen against the local database file — fast, offline-capable."* (S6)

**observation.** **It is the same engine at the same version as the package decision 11
measured.** `@tursodatabase/sync` 0.7.2's `package.json` declares
`"repository": "https://github.com/tursodatabase/turso"` and builds via
`napi build --platform … --manifest-path ../../Cargo.toml` against four targets
(`x86_64-unknown-linux-gnu`, `x86_64-pc-windows-msvc`, `aarch64-apple-darwin`,
`aarch64-unknown-linux-gnu`). Its version, 0.7.2, is the `turso` crate's max stable. (S3, S1)

**interpretation.** Moving the engine to Rust is not swapping products. It is **removing the
NAPI layer from between this application and the engine decision 11 already validated**, at the
same release number. What decision 11 measured about the engine's behaviour should carry; what
it measured about the *JavaScript surface* does not necessarily (see §4).

**source.** The legacy alternative is the **`libsql`** crate: max stable **0.9.30, published
2026-03-19**; max version **0.10.0-pre.4, published 2026-06-02**; 1,807,570 downloads. It is
materially more downloaded and has not had a stable release in five months. (S1)

### Maturity — what is published, and what is not

**source.** The repository FAQ: *"Yes — Turso powers production applications today at multiple
organizations… That said, **we have not yet reached 1.0.** … until we declare 1.0, we recommend
the same discipline you would apply to any database: **keep independent backups.**"* (S7)

**source.** `docs.turso.tech/turso-cloud`: *"Turso databases on Turso Cloud are in **early
preview** — a reflection of how recently the offering landed on the platform, not of the engine
itself."* Sync requires a `--tursodb` database (`/quickstart`), so the early-preview label reaches
the sync path transitively. (S6)

**finding — what was looked for and not found.** There is **no maturity qualifier of any kind
attached to the Rust crate or to `turso::sync`.** Searched the full docs corpus, `/sdk/rust/*`,
the repository README, and `bindings/rust/README.md` for "beta", "alpha", "early preview", "not
production ready", "unstable" scoped to either. Nothing. `bindings/rust/README.md` lists sync as
a plain bullet with no caveat — and is **stale**, pinning `turso = "0.4.3"` against a max stable
of 0.7.2. (S6, S7)

**finding — absence.** **`docs.rs/turso/0.7.2/turso/sync/` returns HTTP 404.** The crate index
lists only `connection`, `params`, `transaction`, `value`. Cause: `bindings/rust/Cargo.toml` has
no `[package.metadata.docs.rs]`, so docs.rs builds default features, which exclude `sync`. **The
sync API has no published rustdoc.** (S8, S7)

**finding — absence.** **The `/sync/*` guide section excludes Rust entirely.** The word "Rust"
appears nowhere in `/sync/usage`, `/sync/conflict-resolution`, `/sync/checkpoint`,
`/sync/partial` or `/sync/local-sync-server`; `/sync/usage`'s own subtitle is *"How to enable and
use sync with Turso across **TypeScript, Python, and Go**."* The Rust quickstart nonetheless links
into that section for conflict resolution. Two SDK pages carry the whole Rust sync story. (S6)

**finding — absence.** `docs.turso.tech/sdk/rust/guides/tauri` exists and is **stale**: it teaches
old libSQL embedded replicas (`Database::open_with_remote_sync`, `libsql` from git), not
`turso::sync`. There is no current Tauri guidance for this path. (S6)

**source — the "not production ready" language existed until six weeks ago, and was removed as
positioning.** `git log README.md` shows commit `62fa6d7e` (2026-04-10, *"Turso is beta"*) changing
`"Even during Alpha"` to `"Even during Beta"`. Until **2026-07-03** the README read verbatim:
*"⚠️ Warning: This software is in BETA… Use caution with production data"* and *"At this point,
libSQL is production ready, **Turso Database is not**."* Commit `1679062d` removed it, with the
message ***"docs: drop the beta warning for 0.7"***. **The label was dropped for a release, not for
a stability milestone** — and the FAQ's pre-1.0 "keep independent backups" line survived it. (S9)

### Open defects on this exact code path

Recorded because none of them is visible from the crate's documentation, and three are unresolved
against the version under consideration (S9):

| Issue | Filed | State | What it says |
| --- | --- | --- | --- |
| [#8369](https://github.com/tursodatabase/turso/issues/8369) | 2026-08-13 | **open, no maintainer response** | *"Deadlock: sync engine holds blocking `parking_lot::Mutex` across await; concurrent `connect()`/`push()` park every tokio worker"* — *"4 concurrent tasks complete in <2s; 30 tasks hang forever, zero completed, 0.0% CPU."* Filed against **`turso 0.7.2 + sync` exactly.** Trigger is concurrency at or above the worker count, which a single-user desktop app is unlikely to reach — but it is this code path. |
| [#5640](https://github.com/tursodatabase/turso/issues/5640) | 2026-02-26 | **open ~6 months**, labelled `bug`/`correctness` | *"Sync engine push: column order mismatch after DROP COLUMN + ADD COLUMN (ABA problem)… old CDC records get misinterpreted — values map to the wrong columns, causing **silent data corruption**."* Directly relevant to an application that migrates schema while synced. |
| [#8129](https://github.com/tursodatabase/turso/issues/8129) | 2026-07-31 | **open**, labelled `corruption?`/`sync` | *"If a sync client's local database files are restored from a backup… every change written after the restore is acknowledged locally but never reaches the server. **Neither side reports an error.**"* The sidecars of §3 must be backed up and restored as an atomic set. |
| [#6363](https://github.com/tursodatabase/turso/issues/6363) | 2026-04-10 | open | *"Data doesn't seem to get synced when the database wasn't created through the sync server client"* — the same shape as §3's CDC-provenance constraint. |
| [#6643](https://github.com/tursodatabase/turso/issues/6643) | 2026-05-01 | open | index + sync produces a UNIQUE constraint failure |
| [#8040](https://github.com/tursodatabase/turso/issues/8040) | — | open | `pull()` reports success but transfers no rows |
| [#7087](https://github.com/tursodatabase/turso/issues/7087), [#6120](https://github.com/tursodatabase/turso/issues/6120) | — | open | the sync test suite is flaky in the maintainers' own CI with `Busy("database is locked")` on Linux and Windows |

Six issues carry the `sync` label; roughly twelve are open on a text search.

### The sync module is LLM-generated, and the crate ships the prompt

**observation.** Both published tarballs — `turso` 0.7.2 and 0.8.0-pre.4 — contain a file
`rust-driver-sync.mdx` beside `src/sync.rs`. Its frontmatter is `name: 2025-12-24-rust-driver-sync`
and its body opens with a `Code` tag carrying `model="openai/gpt-5"` and
`output="./src/sync.rs"`, followed by *"Your task is to generate EXTRA functionality on top of the
existing Rust driver which will extend regular embedded database with sync capability."* It then
specifies the declaration order, the hyper client type, and the exact `Builder` / `Database`
shape. The two versions' `.mdx` files are **byte-identical**; `src/sync.rs` differs between them
by 41 lines, all in the test module. (S2)

**interpretation.** `turso::sync` — the ~940 implementation lines this application would depend
on — is generated output from a prompt dated 2025-12-24, checked in and republished. That is a
statement about how the module is maintained, not a defect claim: it compiles, it carries 25
integration tests against a real local sync server, and §5's behaviours below were read from the
generated code itself. It is recorded because **nothing in the crate's documentation says so**,
and a reader of `src/sync.rs` alone would not know.

## 2 — Coexistence with `sqlx`. This is the finding that decides it, and it is a pass

`apps/desktop/tauri/Cargo.toml` pins `sqlx` 0.9.0 with `sqlite-bundled`, whose comment reads
*"`sqlite-bundled` compiles SQLite into the binary, so there is no system library to depend on."*
That is `libsqlite3-sys` **0.37.0**, which declares `links = "sqlite3"`. (S4, S2)

**source.** **`turso` links no SQLite of its own.** `libsqlite3-sys` does not appear anywhere in
`turso` 0.8.0-pre.4's **own published `Cargo.lock`** — zero matches. `turso_core`'s `Cargo.toml`
declares **no `links` key**, and its `build.rs` compiles no C: it emits three constants
(`PKG_VERSION`, `BUILT_TIME_SQLITE`, `GIT_COMMIT_HASH`) and nothing else. `rusqlite` appears only
in `turso_core`'s **dev**-dependencies — used to test against real SQLite, never linked into a
consumer. (S2)

**interpretation.** `turso_core` is a SQLite *rewrite in Rust*, not a binding to one. Its symbols
are Rust-mangled. There is no `sqlite3_*` C symbol for `libsqlite3-sys`'s to collide with, and no
`links` value for cargo to reject.

**observation — the build was run.** A throwaway crate declaring this repository's exact `sqlx`
line plus `turso = { version = "0.7.2", default-features = false, features = ["sync"] }`,
`reqwest`, `rustls` and `tokio` at the repository's pinned versions:

- resolved cleanly — 378 packages;
- **`cargo build` succeeded and linked**, x86_64-pc-windows-msvc;
- and the binary **ran, exercising both engines in one process**:

```
sqlx      : sqlite_version=3.51.3 value=from-sqlx
turso     : sqlite_version=Text("3.50.4") value=Text("from-turso")
cross-read: OK  sqlx read turso file: from-turso
sync      : builder constructed (sync feature linked)
```

Two independent SQLite implementations reporting two different versions from the same process.
`aws-lc-sys` and `libsqlite3-sys` both compiled here without extra toolchain setup. (S5)

**observation — the contrast, and it is stark.** The same test with `libsql = "0.9.30"` in place
of `turso` **fails to link**:

```
error: linking with `link.exe` failed: exit code: 1169
… sqlite3_bind_blob already defined in liblibsql_ffi-….rlib
```

**292 multiply-defined `sqlite3_*` symbols** between `libsql-ffi` 0.9.30 and `libsqlite3-sys`
0.37.0. `libsql-ffi` declares **no `links` key**, so cargo does not catch it at resolution —
`cargo generate-lockfile` succeeds and the failure lands at link time. (S5, S2)

**conclusion.** The duplicate-SQLite problem the question anticipated **is real, and it belongs
to the `libsql` crate, not to `turso`.** On the coexistence criterion the two candidates separate
absolutely: `turso` builds, links and runs beside `sqlx`; `libsql` cannot be linked into this
binary at all while `sqlite-bundled` is on.

**source — collision is impossible by construction, not merely absent.** `turso_core` ships no
`.c` or `.cpp` files, contains **zero `#[no_mangle]`**, and declares no `links` key. The only crate
in the project that exports `sqlite3_*` symbols is `bindings/c` → `turso_sqlite3`, a separate
crate that is **not published on crates.io**, so it cannot arrive by accident. (S9)

**source — the project links both engines in its own CI.** `turso_core`'s workspace manifest
carries `rusqlite = { version = "0.37.0", features = ["bundled"] }` as a dev-dependency, so
bundled C SQLite and `turso_core` are compiled into one test binary on every run. (S9)

**source — and there is production precedent at this exact version.**
[`spiceai/spiceai`](https://github.com/spiceai/spiceai) ships `bin/spiced` with `turso = "0.7.2",
default-features = false` **and** `rusqlite` with `bundled` in its default feature set; the bump
to 0.7.2 landed 2026-08-02. Spice.ai is one of the production users turso's README names. Of the
72 crates.io reverse-dependents of `turso`, 27 also depend on `rusqlite`, `sqlx` or `libsql`. (S9)

**finding — absence, and a near-miss that is not the same thing.** No issue, pull request or
documentation was found in `tursodatabase/turso` discussing running `turso` **alongside**
`libsqlite3-sys` or `sqlx` in one binary. The build evidence above is this session's own, not a
confirmation from the project.

What the tracker *does* carry is work on the **opposite** arrangement — `sqlx` driving turso
*instead of* C SQLite, through turso's `sqlite3` C-ABI compatibility library and sqlx's
`sqlite-unbundled` mode. It is real and merged (S9):

| Item | State | What it did |
| --- | --- | --- |
| [#635](https://github.com/tursodatabase/turso/issues/635) *"Using as sqlx backend"* | **open**, filed 2025-01-08, last touched 2026-05-26 | the standing request |
| [#6584](https://github.com/tursodatabase/turso/pull/6584) *"sqlite3: sqlx compatibility patches"* | merged 2026-04-28 | honour `_len` in `sqlite3_prepare_v2`; `SQLITE_NULL` from `sqlite3_column_type`; Text via `sqlite3_value_blob`; **and "Intercepts PRAGMA foreign_keys: Replaces it with `SELECT 1` since sqlx often runs this on startup/migrations and panics if it fails. Should be dropped when fully supported."** |
| [#6712](https://github.com/tursodatabase/turso/pull/6712) *"fix three C API compatibility bugs for sqlx"* | closed 2026-06-18 | the same three fixes, restated per-symbol |
| [#6711](https://github.com/tursodatabase/turso/pull/6711) *"add missing symbols required to link with sqlx-sqlite"* | closed 2026-06-17 | *"Add **no-op declarations** so the dynamic library links without undefined-symbol errors"* — `update_hook`, `commit_hook`, `rollback_hook` return NULL; `load_extension` returns `SQLITE_ERROR`; `sqlite3_sql`, `column_database_name`, `column_origin_name` return NULL |

**interpretation.** This is a **third shape** the question did not ask about — one engine, with
`sqlx` layered on turso — and it would dissolve §3's two-engine problem entirely. Three things
weigh against reading it as ready: the enabling symbols are **stubs, not implementations**; the
`PRAGMA foreign_keys` interception means **foreign keys are answered rather than enforced**, which
on a payments ledger is not a small thing and the PR author flags it as temporary; and the
`sqlite3` compatibility library is **not published on crates.io** — `turso_sqlite3`,
`turso-sqlite3` and `limbo_sqlite3` all return "not found" — so consuming it means building a
cdylib out of the repository rather than naming a dependency. Recorded as a finding, not as an
option; ranking it is not mine to do.

### What it costs to add

**observation.** Package counts from the same resolutions (S5):

| Tree | Packages |
| --- | --- |
| this repository's `sqlx` + `reqwest` + `rustls` + `tokio`, no turso (control) | **224** |
| + `turso` 0.7.2, `default-features = false`, `features = ["sync"]` | **378** (+154) |
| + `turso` 0.7.2 with **default** features and `sync` | **433** (+209) |

**source + observation.** Default features are worth turning off deliberately, for two reasons:

- **`mimalloc` installs a global allocator in the consuming binary.** `turso/src/lib.rs:35–37`:
  `#[cfg(all(feature = "mimalloc", …))] #[global_allocator] static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;`
  Adding `turso` with default features swaps the allocator for the **whole Tauri process**.
- **`fts` pulls `tantivy` 0.26.1**, a full-text search engine, into the binary.

`default-features = false, features = ["sync"]` drops both (confirmed: 0 matches for `tantivy`
and `mimalloc` in that lockfile). `simsimd` 6.5.16 remains, from `turso_core`, target-gated off
wasm and windows-aarch64. (S1, S2, S5)

## 3 — The local artifact, and this is where the real friction is

**source.** A synced database at `<path>` produces, from
`turso_sync_engine-0.8.0-pre.4/src/database_sync_engine.rs:139–159`:

| File | Purpose |
| --- | --- |
| `<path>` | the main database |
| `<path>-wal` | main WAL |
| `<path>.db-log` | MVCC logical log |
| `<path>-wal-revert` | revert WAL (rollback-and-replay) |
| `<path>-info` | JSON metadata — client id, synced revision, saved configuration |
| `<path>-changes` | changes file |
| `<path>-replace-base-apply*` | transient markers and backups |

**Sidecars, not a wrapper.** The main file is not enveloped in a container format. **None of these
sidecars are documented on `docs.turso.tech`** — searched, not found; they are readable only in
the source. (S2, S6)

**source.** The engine also creates tables **inside the user's own database**: `turso_cdc`,
`turso_cdc_version` (`database_tape.rs:30, 194`) and `turso_sync_last_change_id`
(`database_sync_operations.rs:2419`). Capture is armed per connection with
`PRAGMA capture_data_changes_conn('<mode>,<table>')` (`database_tape.rs:33, 156`) — **a
turso-only pragma**, implemented in `turso_core/translate/pragma.rs`. (S2)

**interpretation — the consequence for `proxy.rs`.** Change capture is a property of the
*connection that made the write*. A write made through `sqlx` — a different engine entirely,
which cannot execute that pragma — produces no CDC row and therefore **cannot be pushed**. Keeping
the current `sqlx` write path and bolting sync alongside it would produce a database that syncs
some of its writes and silently drops the rest. This is a structural constraint on the shape, not
a bug.

**observation — in WAL mode the file is an ordinary SQLite database.** Bundled C SQLite 3.51.3,
through `sqlx`, opened a `turso_core`-written file and read a row turso had written, **with the
`-wal` still present and uncheckpointed**. Header bytes are `"SQLite format 3\0"`. (S5)

**source — that read worked because the file was closed first, and doing it live is ruled out.**
`COMPAT.md` states four guarantees; the fourth is *"**We don't support mixed SQLite and Turso in
multi-process scenarios.**"* The same file says *"✅ SQLite file format is fully supported"* and
that WAL is the only journal mode turso implements. (S9)

**source — and nothing enforces it, which is worse than forbidding it.** The two engines are in
**disjoint locking domains**:

- turso's WAL index is `{db}-tshm` (`core/storage/wal.rs:120–126`), **not** SQLite's `-shm`. Its
  multi-process support is opt-in and experimental: *"By default, a Turso database file is opened
  by a single OS process… opening the same file from a second process is rejected with a locking
  error"*, and *"On Windows, WASM, and 32-bit targets the flag is accepted but has no effect."* (S9)
- On Windows, turso's open-time lock is **one byte at offset `0x4000_0000_0000_0000`**
  (`core/io/windows_lock.rs:23`, commented *"Keep the open-time database lock outside the useful
  range of every Turso file"*), and it *"rejects opens from other processes while permitting
  multiple in-process handles"*. SQLite's locks live on the lock-byte page at **`0x40000000`** —
  bytes 1073741824–1073742335 (S11). **Different addresses; neither engine can see the other.**
- On Unix, turso takes `fcntl(F_SETLK)` (`core/io/unix.rs:67–71`), which is **process-scoped** —
  a second file descriptor in the *same* process does not conflict with it at all.

SQLite's own `howtocorrupt.html` §2.4: *"It is important that all connections to the same database
file use the same locking protocol… the two applications will not see each other's locks and will
not be able to coordinate database access, **possibly leading to database corruption**."* (S11)

**conclusion.** `sqlx` and `turso` **must not hold the same file open at the same time**, and the
danger is that nothing stops them — no error, no lock contention, just eventual corruption. The
successful cross-read above is a *sequential handoff after a clean close*, and that is the only
arrangement the evidence supports. This is a stronger constraint than the CDC one above: even if
capture were solved, one file with two live engines is not an option.

**source — sequential handoff has its own sharp edge.** turso does **not** checkpoint on exit
(issue [#3729](https://github.com/tursodatabase/turso/issues/3729), *"Checkpoint database on upon
`.exit`"*, **open since 2025-10-14**), and auto-checkpoint is disabled for sync databases anyway —
so a reader that ignores the `-wal` sees a stale file. Turso also does not increment the file
change counter at byte 24 (issue
[#6676](https://github.com/tursodatabase/turso/issues/6676), **open 2026-05-04**, filed with a
rusqlite-vs-turso comparison test), which is the field SQLite uses to detect another process's
writes. (S9)

**finding — the compatibility fuzzing runs in one direction only.** Issue
[#2576](https://github.com/tursodatabase/turso/issues/2576), **open since 2025-08-13**, is the
whole plan: *"let's fuzz test by **making SQLite generate complex databases, and ensure that Turso
is able to read them correctly**."* There is no counterpart issue for *turso writes, SQLite reads*
— which is the direction this application would depend on. (S9)

**finding — 0.7.2 predates a silent-data-loss fix.** PR
[#8103](https://github.com/tursodatabase/turso/pull/8103), merged **2026-08-07**: *"A crash before
the first checkpoint used to leave the main database file empty (0 bytes) while every committed,
fsync-acknowledged transaction — including page 1 itself — lived only in the -wal… **The whole
first WAL epoch was silently lost** and `PRAGMA integrity_check` reported ok against the blank
image."* **`turso` 0.7.2 was published 2026-07-30.** The fix is in `0.8.0-pre.4` only. (S9)

**observation — in MVCC mode it is not.** Same probe, after `PRAGMA journal_mode = 'mvcc'`:

```
PRAGMA journal_mode='mvcc' -> Text("mvcc")
PRAGMA journal_mode (readback) -> Text("mvcc")
turso reads back -> Text("written-in-mvcc-mode")
on-disk: ["m.db (8192 bytes)", "m.db-log (302 bytes)", "m.db-wal (0 bytes)"]
header[0..16] = "SQLite format 3\0"
sqlx/C-SQLite QUERY FAILED: error returned from database: (code: 26) file is not a database
```

**The header still says `SQLite format 3\0` and stock SQLite still refuses it** — `SQLITE_NOTADB`.
turso reads its own data back fine. (S5)

**source — and the sync engine can flip that mode by itself.**
`database_sync_engine.rs:1608` defines `ensure_local_mvcc_journal_mode`, which runs
`PRAGMA journal_mode = 'mvcc'` against the local database. It is called from `wait_changes` on the
first server contact whenever the remote is detected as MVCC-protocol — both at
`(RemotePullProtocol::MvccLogical, None)` and at `(RemotePullProtocol::Unknown, None)` when
`detected == RemotePullProtocol::MvccLogical`, with the comment *"Deferred replicas may still be
in WAL mode locally; the MVCC page base must be applied to an MVCC-mode database."* (S2)

**conclusion.** Whether the local replica stays openable by `sqlx` **is not a property this
application chooses. It is decided by which protocol the remote speaks, discovered on the first
pull.** If Turso Cloud answers MVCC, the local file converts and `sqlx` can no longer open it —
which would end the migration runner over that file and `proxy.rs` reading it. In WAL mode both
engines can read it.

**Not established: which protocol Turso Cloud actually speaks today.** That is a live-service
fact and needs a request against a real database, which this run did not have.

**source — the engine refuses a foreign local database, and this bears on decision 12.** The same
function rejects, before converting:

> `"local database contains tables without CDC history ({}); the sync engine cannot preserve their data across the initial sync with an MVCC-mode remote (create the local database through the sync engine, or start from an empty local file)"`

with the reasoning that *"Changes without CDC provenance (a database file that lived outside the
sync engine) would be silently dropped — reject loudly instead."* (S2)

**interpretation.** An existing `sqlx`-created local workspace, already populated on a real
machine, **cannot simply be adopted** by the sync engine against an MVCC remote. Decision 12's
local-to-hosted conversion would have to move rows *through* the engine, not hand it a file.

**source — and on the non-MVCC path it is worse: the file is overwritten rather than refused.**
Whether bootstrap runs is decided **solely by whether `{path}-info` exists** — nothing inside the
`.db` is consulted. With the default `bootstrap_if_empty(true)`, pointing the builder at a path
that already holds an `sqlx`-created database but has no `-info` sidecar takes the bootstrap
branch, and `database_sync_operations.rs` writes remote pages with `truncate_on_first_response: true`.
**There is no "is this already a database?" guard.** (S9)

**conclusion.** The two failure modes are opposite and both bad: against an MVCC remote a
populated foreign file is **rejected loudly**; against a non-MVCC remote it is **truncated and
replaced silently**. Either way, handing the sync engine an existing local workspace file is not
the conversion path.

**source — one experimental mode does wrap the file.** Partial sync
(`partial_sync_config_experimental`, default `None`, opt-in and Linux-only) replaces the storage
with a `LazyDatabaseStorage` over a **sparse file with holes fetched on demand** — which is not a
standalone SQLite database. It is off unless asked for, and its API name carries `experimental`. (S9)

**source.** `docs.turso.tech/sync/checkpoint`: *"Auto-checkpoint is **disabled** for sync databases —
you must call `checkpoint()` explicitly."* and *"Without checkpointing, the WAL grows unbounded.
After many writes, the WAL can become significantly larger than the database itself."* (S6)

**finding — absence.** Turso publishes **no statement that a sync-produced local file is an
ordinary SQLite file readable by other tooling.** The engine-level claim exists — *"Turso is
compatible with SQLite at the SQL dialect, file format, and C API levels, and existing SQLite
database files work as-is. We are not at 100% yet"* (S7, README FAQ) — and the only documented
carve-out is encryption: *"Encrypted databases cannot be read as standard SQLite databases"* (S6).
Nothing scoped to sync. The WAL-mode read above is my observation, not a vendor guarantee.

## 4 — The deferred-open property. Rust has it, as a named method

Decision 11 measured that a `url` passed **as a function answering `null`** opens offline, takes
writes and pushes later, whereas a **string** to an unreachable remote throws and leaves no usable
local database.

**observation — that trick is `bootstrap_if_empty` wearing a disguise.** `@tursodatabase/sync`
0.7.2, `dist/promise.js:93`:

```js
bootstrapIfEmpty: typeof opts.url != "function" || opts.url() != null,
```

The JavaScript surface has no `bootstrapIfEmpty` option — decision 11, question 3, is right about
that — it **derives** one from whether `url` is a function returning null. The measured property is
the JS expression of an engine knob. (S3)

**source — Rust exposes the knob directly.** `turso::sync::Builder` has
`pub fn bootstrap_if_empty(mut self, enable: bool) -> Self`, defaulting to `true`
(`turso/src/sync.rs:139, 266`; identical in 0.7.2 and 0.8.0-pre.4). (S2)

**source — and the engine has an explicit no-network branch.** In `database_sync_engine.rs`, with
no metadata file present:

- `bootstrap_if_empty == true` → calls `bootstrap_db_file(…)`, which contacts the remote.
- `bootstrap_if_empty == false` → the **"Deferred bootstrap"** branch, commented *"Deferred
  bootstrap: the remote's protocol is unknowable until the first server contact; the first pull
  resolves it."* It writes metadata with `synced_revision: None` and
  `remote_pull_protocol: Unknown`, and **makes no network call at all**. (S2)

**source — two documented refusals on that branch**, both explicit errors: *"deferred bootstrap is
not supported for legacy protocol"* and *"deferred bootstrap is not supported for partial sync"*. (S2)

**source.** `remote_url` is `Option<String>`, with the comment *"If remote_url omitted in
configuration - tursodb will try to load it from the metadata file"* (`sync.rs:219–221`). Where no
URL is available at request time the HTTP path calls
`completion.poison("remote_url is not available")` (`sync.rs:800`) — a named failure, not a panic.
That matches the JS behaviour decision 11 recorded as *"refuses to push with a message naming its
own reason"*. (S2)

**source.** `/sdk/rust/reference` documents it: `.bootstrap_if_empty(true)  // Download schema on
first sync (default)`. (S6)

**source — the crate asserts it in its own test suite.** `turso/src/sync.rs:2294–2308` builds
against a fresh empty `TempDir` with the comment *"bootstrap_if_empty(false) keeps `build()` from
issuing any HTTP requests so we control invocations purely through `pull()` calls"* and expects
`"build with bootstrap_if_empty(false) must not issue HTTP"`. Present verbatim in 0.8.0-pre.4. (S9)

**observation — and it was run here, against a genuinely unreachable remote.** With the remote set
to `https://192.0.2.1` (TEST-NET-1, non-routable) and a ring provider installed:

```
--- build(bootstrap_if_empty=false) against unreachable remote ---
build(): OK - opened with no network
offline writes accepted
--- push() against unreachable remote ---
push(): Err -> sync engine operation failed: database sync engine error: http request failed: client error (Connect)
on-disk: ["w.db(0b)", "w.db-changes(0b)", "w.db-info(603b)", "w.db-wal(45352b)"]
```

**`build()` returns a usable database with no network, writes are accepted, and `push()` fails
with a named error rather than hanging.** This is the Rust equivalent of what decision 11
measured through the JavaScript callback, confirmed directly. (S5)

**observation — with one detail worth carrying.** The main file is **0 bytes**; all 45 kB of the
offline writes are in `w.db-wal`. That is exactly the state PR #8103 (§3) describes as having
silently lost the entire first WAL epoch on a crash before the first checkpoint — and `turso`
0.7.2 predates that fix. It also means `sqlx` reading the main file before a `checkpoint()` would
see an empty database, not the offline writes. (S5)

**conclusion.** The Rust API has the equivalent, and it is **better than equivalent**: what
JavaScript reaches through a callback returning null, Rust names, tests, and — verified here —
actually delivers.

## 5 — Sync surface and failure behaviour

**source.** `turso::sync::Database`, in full (`turso/src/sync.rs:424–511`):

| Method | Signature | Behaviour |
| --- | --- | --- |
| push | `async fn push(&self) -> Result<()>` | drives `sync.push_changes()` |
| pull | `async fn pull(&self) -> Result<bool>` | `wait_changes()`, then `apply_changes()` if non-empty; **`true` means changes were applied** |
| checkpoint | `async fn checkpoint(&self) -> Result<()>` | retries on busy — `CHECKPOINT_BUSY_MAX_ATTEMPTS = 100`, `CHECKPOINT_BUSY_RETRY_DELAY = 10ms` |
| stats | `async fn stats(&self) -> Result<DatabaseSyncStats>` | `network_received_bytes`, `network_sent_bytes`, `main_wal_size` |
| connect | `async fn connect(&self) -> Result<Connection>` | a SQL connection over the synced database |

**source — token rotation, which decision 11 question 5 rests on, is a first-class API.**
`Builder::with_auth_token_fn` takes an async callback, documented *"The callback is invoked before
every HTTP request, so it can return a freshly rotated token (e.g. fetched from a secrets manager
or refreshed via OAuth)."* The implementation resolves it per request inside `process_http`, with
the comment *"Resolved here rather than once at spawn so dynamic providers can rotate the token
between requests."* Two tests cover it: `test_sync_sends_bearer_auth_header` and
`test_sync_auth_token_fn_called_per_request`. (S2)

**source — URL schemes.** `normalize_base_url` maps `libsql://` and `turso://` to `https://`,
accepts `http://` and `https://`, and rejects everything else with `"unsupported remote URL scheme"`.
Its unit test asserts `normalize_base_url("libsql://db.turso.io") == "https://db.turso.io"`.
So **the `libsql://` database decision 11 confirmed as a valid target is accepted by construction
in Rust too.** Note `bindings/rust/README.md` lists only *"https://, http://, or libsql://"* — it
omits `turso://`, which the source accepts and which the CLI hands you. A doc bug, not a
constraint. (S2, S7)

**source — conflict has no library-provided recovery, and the error is not even typed.**
`Error::DatabaseSyncEngineConflict` is declared in `turso_sync_engine/src/errors.rs:11–12` and
**constructed in exactly one place** — `database_sync_operations.rs:2400`, when `wal_push` gets
`status == "conflict"`. Grepping the whole crate for that variant returns **three hits: the doc
comment, the construction, the enum declaration.** It is **handled and retried nowhere.** (S2)

**source — and it is flattened on the way out.** `turso_sync_sdk_kit/src/turso_async_operation.rs:217–221`
maps *every* sync-engine failure to one string:

```rust
let message = format!("sync engine operation failed: {err}");
self.result = Some(Err(rsapi::TursoError::Error(message.clone())));
```

`turso::Error` (`turso/src/lib.rs:86–115`) has variants for `Busy`, `Constraint`, `Readonly`,
`Corrupt`, `NotAdb` and others — **and none for conflict.** (S2)

**conclusion.** A caller cannot distinguish a push conflict from a network failure from a schema
error **except by matching the substring `"database sync engine conflict"` inside
`Error::Error(String)`.** This is the same shape decision 11 §4 found in the `libsql` fallback —
it errors, with no recovery path — with the added cost that here it is not even a distinguishable
variant.

**source — what the docs say instead.** `/sync/conflict-resolution`: *"Turso sync uses a **last
push wins** strategy. When two clients modify the same data and push, the last push determines the
final state on the remote."* Pull is documented as atomic rollback-and-replay: *"1. Your local
database is rolled back to the last synced state / 2. Remote changes are applied / 3. Your
unpushed local changes are replayed on top … if anything fails, your database remains in its
previous state."* (S6)

**finding — absences, all three deliberate.** (a) No conflict semantics stated **for Rust** —
`/sync/conflict-resolution` is language-neutral prose and `bindings/rust/src/sync.rs` contains zero
occurrences of `conflict`, `rollback` or `revert`; the logic is server-side and in the engine.
(b) **No documented recovery procedure for a push that fails on conflict** — the docs describe only
the *offline* failure mode ("changes are safe in the local file and will sync on the next push()").
(c) **No statement that `push()` is atomic**; atomicity is asserted for pull only. (S6, S2)

**caution — a near-miss source that must not be carried over.** `docs.turso.tech/agentfs/guides/sync`
*does* document a conflicting-push recovery — *"Push from Machine B fails (conflict) … Machine B
must pull first, then push"* — but that is **AgentFS, a different product**, and its pull-rebase-retry
model contradicts "last push wins" as published for Turso Sync. It is not evidence about this crate. (S6)

## 6 — Build and shipping cost

**source + observation — the TLS finding, and it contradicts a recorded choice in this repository.**
`apps/desktop/tauri/Cargo.toml` selects `reqwest` with `rustls-no-provider` and `rustls` with
`ring` only, and its comment says this is deliberate: *"`rustls-no-provider` rather than `rustls`,
which would pull aws-lc-rs in beside the ring provider the tree already builds through
tauri-plugin-updater."* (S4)

`turso`'s `sync` feature declares `hyper-rustls ^0.27.9` **with default features on**, and
hyper-rustls's default features include `aws-lc-rs`. `cargo tree -e features` gives the exact
chain (S5):

```
hyper-rustls v0.27.9
├── hyper-rustls feature "aws-lc-rs"
│   └── hyper-rustls feature "default"
│       └── turso v0.7.2
│           └── turso feature "sync"
```

**`turso` exposes no feature to select a crypto provider** — its complete feature list is
`default`, `fts`, `io_memory_yield`, `mimalloc`, `pure-rust-crypto`, `stacker`, `sync`,
`test_helper`. Because cargo features are additive and only the *declaring* crate can set
`default-features = false`, a consumer **cannot** turn this off. The control tree (no turso)
contains **zero** `aws-lc-rs`; adding turso brings `aws-lc-rs` 1.18.0, `aws-lc-sys` 0.44.0 and
`cmake`. (S1, S5)

**source — hyper-rustls's default flipped to `aws-lc-rs` at 0.27.0 and has not moved.** Its
`Cargo.toml` at tag `v/0.27.9` declares
`default = ["native-tokio", "http1", "tls12", "logging", "aws-lc-rs"]`, and because it sets
`default-features = false` on rustls, that list is the sole provider selector. The 0.27.0 release
note (2024-03-26) says so and names the cost: *"Default cryptography provider changed to
`aws-lc-rs`… this has some implications on platform support and build-time tool requirements such
as `cmake` on all platforms and `nasm` on Windows."* (S10)

**source — the NASM half of that has since aged out.** rustls 0.23 wires
`aws_lc_rs = [..., "aws-lc-rs/prebuilt-nasm"]`, and aws-lc-rs's Windows requirements say NASM
*"can be avoided using prebuilt NASM objects"*. A C compiler is still required. (S10)

**interpretation.** Enabling `turso/sync` reverses the repository's ring-only decision. It built
here on Windows x86_64 with no extra setup, so on this platform the cost is build time and
toolchain surface rather than a blocker.

### The provider hazard, and this repository is already on the right side of it

**source.** `turso` never installs a crypto provider — searching the repository for
`install_default` and `CryptoProvider` returns nothing — and `sync.rs:698–699` builds its client as
`HttpsConnector::builder().with_native_roots()`, which routes into rustls's process-default lookup.
With **both** `ring` and `aws-lc-rs` features enabled, rustls's `from_crate_features()` returns
`None` and the caller panics. (S2, S9, S10)

**observation — reproduced here, and the failure mode is worse than a panic.** The same probe as
§4, run with **no provider installed**:

```
provider: none installed
rustls default present: false
--- build(bootstrap_if_empty=false) against unreachable remote ---
thread 'turso-sync-io' (43768) panicked at rustls-0.23.43\src\crypto\mod.rs:249:14:
Could not automatically determine the process-level CryptoProvider from Rustls crate features.
Call CryptoProvider::install_default() before this point to select a provider manually, or
make sure exactly one of the 'aws-lc-rs' and 'ring' features is enabled.
build(): TIMED OUT after 20s (it blocked)
```

**The panic lands on turso's own `turso-sync-io` thread, so `build()` does not return an error —
it never returns at all.** The awaiting task is simply never woken. A caller sees a hang, not a
crash, and not a `Result::Err`. (S5)

**observation — and installing ring fixes it completely.** The identical run with
`rustls::crypto::ring::default_provider().install_default()` first produced the successful §4
output. **This repository already does exactly that**: `apps/desktop/tauri/src/http.rs:30–34`
installs the ring provider guarded on `CryptoProvider::get_default().is_none()`, precisely because
`rustls-no-provider` leaves the choice to this crate. (S4, S5)

**interpretation.** The dual-provider trap is real and its symptom is a silent hang, but the
mitigation is already present in this repository. What it converts into is an **ordering
requirement**: `install_crypto_provider()` must run before any sync database is built. That is a
constraint on startup sequence, invisible until the day it is violated — the same shape as §4's
constraint on how the client is opened.

**finding — there is no feature-flag escape.** Cargo features are additive and only the declaring
crate may set `default-features = false`, so a consumer cannot strip `aws-lc-rs` from turso's
hyper-rustls line. This was put to hyper-rustls's maintainers directly — issue
[#288](https://github.com/rustls/hyper-rustls/issues/288) is **open since 2024-09-16**, and
[#280](https://github.com/rustls/hyper-rustls/issues/280) was closed with *"downstream crates can
(and should) do precisely this, such that the choice of provider is left to the 'topmost' crate"*.
`turso` is an intermediate crate that did not. The remaining levers are: accept aws-lc-sys; patch
hyper-rustls; vendor `turso`; or skip `sync`. (S10)

**finding.** turso once carried a pure-Rust-TLS PR —
[#5527](https://github.com/tursodatabase/turso/pull/5527) *"add sync-rustls feature for pure-Rust
TLS"* — **closed unmerged 2026-02-23** over a licensing mismatch flagged by CI. hyper-rustls
arrived instead via [#7312](https://github.com/tursodatabase/turso/pull/7312) (merged 2026-06-02),
*"Replaces hyper-tls with hyper-rustls to eliminate need for OpenSSL system dependency."* (S9)

**finding — the harder C dependency is `simsimd`, not aws-lc.** `turso_core`'s manifest declares
it **non-optional** for every target except wasm and windows-aarch64. Two issues are open on
exactly this: [#4245](https://github.com/tursodatabase/turso/issues/4245) (2025-12-16)
*"`simsimd` is a hard dependency of the core crate, which makes using turso on platforms without
easy C support… impossible"* and [#7660](https://github.com/tursodatabase/turso/issues/7660)
(2026-06-29) *"These come with C dependencies, making Turso not pure Rust… `simsimd` cannot be
skipped at the moment."* The fix, PR
[#7905](https://github.com/tursodatabase/turso/pull/7905) *"set C-dependent simsimd as an opt-out
feature"*, is **open and unmerged**. (S9)

**observation — cross-platform.** Only **x86_64-pc-windows-msvc** was exercised here. What the
project's own CI establishes: `.github/workflows/rust.yml` runs
`cargo build --locked --all-features` natively on Ubuntu, macOS and Windows-2025 — so `sync` and
`aws-lc-sys` do build on Windows in CI, **with no NASM install step anywhere in the repository**,
corroborating the prebuilt-NASM finding. Windows needs `choco install llvm`; the one genuine
cross-target, Windows ARM64, required a hand-rolled MSVC environment. `dist-workspace.toml` ships
the six standard desktop triples, and `bindings/rust/README.md` claims *"Cross-Platform: Supports
Linux, macOS, and Windows"*. `aegis` takes its `pure-rust` feature automatically on macOS and
Android. **This crate combination on macOS and Linux remains unverified.** (S9, S2, S5)

# Conclusion

**The crate is `turso`, with the non-default `sync` feature — max stable 0.7.2 (2026-07-30), max
version 0.8.0-pre.4 (2026-08-11).** It is real, published, actively released, and it is the same
engine at the same version number as the `@tursodatabase/sync` 0.7.2 that decision 11 validated
live. Turso's own crate descriptions point Rust applications to it, and `docs.turso.tech` documents
its sync surface on two SDK pages.

**It coexists with `sqlx` 0.9.0 / `sqlite-bundled`, and this was demonstrated rather than
inferred**: the two link into one binary and both run, reporting SQLite 3.51.3 and 3.50.4 from the
same process. `turso_core` is a pure-Rust rewrite that links no C SQLite, declares no `links` key,
and appears nowhere near `libsqlite3-sys`. **The legacy `libsql` crate fails the same test
outright** — 292 multiply-defined `sqlite3_*` symbols, `LNK1169`, no link. The coexistence risk the
question was most worried about is real, and it lands entirely on the crate that is not being
proposed.

**The deferred-open property survives the move, and improves.** What decision 11 measured through
a JavaScript callback answering null is `bootstrap_if_empty(false)` in Rust — a named builder
method, asserted by an in-crate test, and **verified here against a non-routable remote**:
`build()` returns, offline writes are accepted, and `push()` fails with a named error rather than
hanging. Token rotation, which decision 11 question 5 rests on, is likewise a first-class API
(`with_auth_token_fn`, resolved per request, two tests).

**The load-bearing risk moved, and it is now §3 — the file, not the link.** Three things, in
descending order:

1. **Two live engines must never share one file.** `COMPAT.md` says so outright — *"We don't
   support mixed SQLite and Turso in multi-process scenarios"* — and nothing enforces it: turso
   uses `-tshm` where SQLite uses `-shm`, its Windows lock byte sits at `0x4000000000000000` where
   SQLite's lock page is at `0x40000000`, and its Unix `F_SETLK` is invisible to a second handle
   in the same process. Sequential handoff after a clean close works — demonstrated — but
   concurrent access is a corruption path with no error on the way in.
2. **Change capture belongs to the connection that writes.** Writes made through `sqlx` produce
   no `turso_cdc` row and therefore cannot be pushed. Keeping the current write path and adding
   sync beside it yields a database that syncs some writes and silently drops the rest.
3. **The local file may stop being a SQLite file at all.** If the remote speaks the MVCC protocol,
   the engine converts the local database to a journal mode stock SQLite refuses with
   `SQLITE_NOTADB` — while the header still reads `SQLite format 3\0`. That is decided by Turso
   Cloud, not by this application, and discovered on the first pull.

**Two costs are concrete and were not anticipated by the question.** `turso/sync` forces
`aws-lc-rs` in beside `ring`, and with both rustls providers enabled and none installed the
failure is **a panic on turso's IO thread that presents to the caller as a hang** — this
repository's existing `install_crypto_provider()` in `src/http.rs` already prevents it, which
turns the hazard into a startup-ordering requirement. And `simsimd` is a non-optional C dependency
of `turso_core` on every desktop target, with the opt-out PR still unmerged.

**Confidence.** High on §1, §2, §4, §5 and §6 — crate source, registry metadata, and builds and
runs performed here. High on §3's mechanisms, **unknown on whether the MVCC conversion fires
against Turso Cloud**, which is the one gap that would change the shape of the answer.

**Version note.** `0.7.2` is the max stable and the version matched to the JavaScript package
decision 11 validated — but it **predates PR #8103** (merged 2026-08-07), which fixed a crash
before the first checkpoint silently losing the entire first WAL epoch while `integrity_check`
reported ok. The offline-open probe above ended in exactly that state: main file 0 bytes, 45 kB of
committed writes in the WAL. Choosing between 0.7.2 and 0.8.0-pre.4 is a real choice, not a
formality, and it is not mine to make.

# Not checked

- **Whether Turso Cloud speaks the MVCC protocol.** The single most consequential open item: it
  decides §3, and it needs one request against a real database.
- **macOS and Linux.** Every build and run here was x86_64-pc-windows-msvc. Turso's own CI builds
  `--all-features` natively on all three, which is corroboration, not verification of this
  combination.
- **Whether a `checkpoint()` makes the replica file readable by `sqlx` again.** The offline probe
  left the main file at 0 bytes with everything in the WAL; `checkpoint()` was not called and the
  post-checkpoint cross-read was not attempted.
- **Runtime behaviour of push/pull against a live Turso Cloud database from Rust** — conflict
  behaviour, the per-column loss decision 11 measured in JavaScript, reconcile cost, token rotation
  end to end. All of decision 11's *measurements* were taken through the NAPI binding; none were
  re-run against the Rust API. They are expected to carry because it is the same engine, but that
  is inference, not observation.
- **Binary-size cost.** The probe binaries were too small to measure meaningfully; only crate
  counts (224 → 378) are reported.
- **`turso` 0.8.0-pre.4 as the candidate.** Its sync API was read here and differs from 0.7.2 only
  in `IoBackend` / `page_codec` / `open_flags` config fields and test-harness changes, but it is a
  pre-release and was not built.
- **Concurrent access was not tested empirically** — every cross-read above was after a clean
  close. §3 argues from `COMPAT.md`, the lock offsets in turso's source, and SQLite's own
  corruption guide that it is unsafe; it does not demonstrate a corruption.
- **`turso_core`'s SQL dialect coverage against this schema.** The README says compatibility is
  *"not at 100% yet"*; no migration under `apps/desktop/tauri/migrations/` was run through it.
  Nor was it established whether the repository's migration runner could run **through** the turso
  connection instead of `sqlx` — which is the obvious alternative to §3's problem and was not
  investigated.
- **Whether any of §1's open defects reproduce here.** #8369, #5640 and #8129 are reported, not
  confirmed; none was run.
- **`sqlx`'s position on a native turso driver, beyond the surface.** `transact-rs/sqlx` #2674 is
  open since 2023-08-01, and the only native attempt — `sqlx-turso` / `sqlx-turso-core`
  0.1.0-alpha.1 — was last pushed 2026-05-28 and reads as an abandoned proof of concept. Not
  evaluated as an option.
