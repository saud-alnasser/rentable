---
owner: repository
kind: research
falsifies: []
---

# Which of the thirteen open Renovate updates can land together, and which cannot?

Verified against: crates.io and registry.npmjs.org, 2026-08-03; cargo 1.97.1, resolution probes run locally
Status: answered. Three updates are demonstrated unlandable as proposed; the rest co-resolve.

## Answer

Ten of the thirteen can land as one change. Three cannot, each for a different and independently
verified reason:

- **TypeScript 7 is blocked upstream, not merely awkward.** No published version of either
  `typescript-eslint` or `svelte-check` accepts it, so the gate's lint and check steps fail at peer
  resolution before any code is compiled. This is not a migration that can be attempted — there is
  nothing to migrate to.
- **keyring 4 is a restructured crate, not a bumped one.** Every feature the repository names was
  removed; the crate split into a core plus per-platform store crates.
- **sqlx 0.9 removed the feature the repository builds against**, and simultaneously made the
  `libsqlite3-sys` pin obsolete by absorbing bundling into its own feature set.

The `libsqlite3-sys` bump Renovate proposes is **invalid under both sqlx versions** and would never
have built.

## Findings

### The libsqlite3-sys pin

- `sqlx-sqlite` **0.8.6** — the version the repository resolves today — requires
  `libsqlite3-sys ^0.30.1` — [crates.io dependencies API for sqlx-sqlite 0.8.6](https://crates.io/api/v1/crates/sqlx-sqlite/0.8.6/dependencies)
- `sqlx-sqlite` **0.9.0** requires `libsqlite3-sys >=0.30.1, <0.38.0` — [crates.io dependencies API for sqlx-sqlite 0.9.0](https://crates.io/api/v1/crates/sqlx-sqlite/0.9.0/dependencies)
- Renovate's non-major group proposes `=0.30.1` → **`=0.38.1`**, which satisfies neither range. The
  proposed bump cannot resolve under sqlx 0.8.6 and cannot resolve under sqlx 0.9.0 either — the
  update is wrong independently of which sqlx the repository is on
- `=0.30.1` satisfies **both** ranges, so holding the pin exactly where it is remains correct across
  the sqlx upgrade as well — local `cargo generate-lockfile` probe, sqlx 0.8.6 + `libsqlite3-sys =0.30.1`
  with `bundled`, resolved cleanly (263 packages)

### sqlx 0.9 restructured its features

- `sqlx` 0.9.0 **has no `runtime-tokio-rustls` feature**. Cargo rejects the repository's current
  feature list outright: `package depends on sqlx with feature runtime-tokio-rustls but sqlx does not
  have that feature` — local `cargo generate-lockfile` probe against sqlx 0.9.0
- The 0.9.0 feature list cargo reported includes `runtime-tokio`, `tls-rustls-ring`,
  `tls-rustls-aws-lc-rs`, `sqlite-bundled`, and `sqlite-unbundled` — the runtime and TLS choices are
  now separate features, and bundling is a first-class sqlx feature
- With `["runtime-tokio", "tls-rustls-ring", "macros", "sqlite", "sqlite-bundled", "migrate", "uuid", "chrono"]`
  and **no direct `libsqlite3-sys` dependency at all**, sqlx 0.9.0 resolves `libsqlite3-sys 0.37.0`
  by itself and pulls `ring 0.17.14` with no `aws-lc-rs` in the tree — local probe, 180 packages
- That matters beyond the version numbers: the direct `libsqlite3-sys` dependency exists **only** to
  switch on `bundled` for the copy sqlx resolves, because sqlx 0.8 offers no way to ask for it.
  Under 0.9 that reach-around is unnecessary, and the pin can be deleted rather than maintained.
  The upgrade removes the workaround instead of carrying it forward

### keyring 4 is a different crate shape

- `keyring` 4 **has no `windows-native` feature**; cargo rejects it against every published 4.x
  (4.0.0 through 4.1.6) — local `cargo generate-lockfile` probe
- The features 4.1.6 actually publishes are `default: ["v1"]`, `v1`, and `cli`. `v1` expands to
  `["apple-native-keyring-store/keychain", "windows-native-keyring-store", "zbus-secret-service-keyring-store"]`
  — [crates.io version API for keyring 4.1.6](https://crates.io/api/v1/crates/keyring/4.1.6)
- So `windows-native`, `apple-native`, `linux-native-sync-persistent`, and `crypto-rust` — all four
  features the repository's three `[target.*]` blocks name — no longer exist. The crate split into a
  `keyring-core` plus separate per-platform store crates, and the platform blocks have to be
  rewritten rather than version-bumped

### TypeScript 7 has no compatible toolchain

- `typescript` **7.0.2 is the current `latest`** — [registry.npmjs.org/typescript](https://registry.npmjs.org/typescript), `dist-tags`
- `typescript-eslint@8.65.0` — the newest published, and the version Renovate's non-major group
  targets — declares `typescript: ">=4.8.4 <6.1.0"`. Every one of the six most recent releases
  (8.61.1 through 8.65.0) declares the identical range — [registry.npmjs.org/typescript-eslint](https://registry.npmjs.org/typescript-eslint)
- `svelte-check@4.7.4` — the newest published — declares `typescript: "^5.0.0 || ^6.0.0"` — [registry.npmjs.org/svelte-check](https://registry.npmjs.org/svelte-check)
- Both are in the gate: `svelte-check` runs as `pnpm check`, `typescript-eslint` as `pnpm exec eslint .`.
  TypeScript 7 breaks both at peer resolution
- Corollary worth carrying: the same `typescript-eslint` bound caps TypeScript at **`<6.1.0`**, so
  the existing `^6.0.0` range is only safe while no 6.1 is published. None is today — the 6.x
  `dist-tags` entry is `6.0.0-beta` and `latest` has moved to 7

### ESLint 10 is clear

- `typescript-eslint@8.65.0` declares `eslint: "^8.57.0 || ^9.0.0 || ^10.0.0"`
- `eslint-plugin-svelte@3.22.0` declares `eslint: "^8.57.1 || ^9.0.0 || ^10.0.0"`
- `@eslint/compat@2.1.0` declares `eslint: "^8.40 || 9 || 10"`, optional
- `eslint-config-prettier@10.1.8` declares `eslint: ">=7.0.0"`
- All four accept ESLint 10, **provided** the non-major bumps land in the same change — the versions
  currently locked (`typescript-eslint` 8.58.2, `eslint-plugin-svelte` 3.17.0) are older than those
  checked above. ESLint 10 and the non-major group are therefore coupled: neither is safe alone

### The remaining majors carry no peer objection

- `prettier-plugin-svelte@4.1.1` declares `svelte: "^5.0.0"`, `prettier: "^3.0.0"`, `node: ">=20"` —
  all satisfied by the repository's Svelte 5, Prettier 3, and `engines.node: ^24.0.0`
- `drizzle-orm@0.45.2` declares `better-sqlite3: ">=7"` and `@types/better-sqlite3: "*"`, both
  **optional** — better-sqlite3 13 and `@types/better-sqlite3` 9 raise no peer conflict
- `better-sqlite3@13.0.2` declares `engines.node: ">=22"`, satisfied by `^24.0.0`
- `prettier-plugin-tailwindcss@0.8.1` declares `prettier: "^3.0"` and an optional
  `prettier-plugin-svelte: "*"` — compatible with the plugin's v4

### The remaining Rust bumps resolve and keep their API surface

- A single probe carrying `sqlparser 0.62.0`, `base64 0.23.0`, `chrono 0.4.45`, `getrandom 0.4`,
  `serde 1.0.229`, `serde_json 1.0.151`, `tokio 1.53.1`, `reqwest 0.13.4`, `rustls 0.23.43`,
  `sqlx 0.8.6`, and `libsqlite3-sys =0.30.1` resolved cleanly — 263 packages, `getrandom` landing on
  0.4.3 and `base64` on 0.23.0
- The four API items the repository actually calls still exist at the proposed versions, each
  confirmed by a 200 from docs.rs: `getrandom::fill` at 0.4.3, `base64::engine::Engine` and
  `base64::engine::general_purpose` at 0.23.0, and `sqlparser::dialect::SQLiteDialect` at 0.62.0

## Limitations

- **Resolution was verified; compilation was not.** Every Rust finding above rests on
  `cargo generate-lockfile` and on docs.rs confirming an item's existence at a version. Neither
  proves the repository's call sites still typecheck — a changed signature on a surviving item would
  not show up in either check. `base64` 0.23 and `getrandom` 0.4 are the likely places for that, and
  a `cargo check` during implementation is what settles it. The probes were run in a scratch crate
  rather than against the repository's own source precisely so the working tree was not disturbed
  during a planning stage.
- **The npm side was checked by peer range, not by installing.** `pnpm install` was never run, so
  peer-range satisfaction is proven but transitive resolution conflicts and lockfile churn are not.
  The ESLint 10 conclusion in particular depends on the non-major bumps landing simultaneously; if
  they are split, it has to be rechecked.
- **`tauri-apps/tauri-action` v1.0.0 was not investigated.** Whether its inputs changed from v0.6.2
  is unverified — it is a GitHub Action, so neither registry answers it, and the release workflow is
  the only consumer. Treat its input compatibility as an open question at implementation time.
- **`pnpm` 11's lockfile format was not checked.** Whether it rewrites `pnpm-lock.yaml` wholesale,
  and whether `pnpm/action-setup@v6` honours a `packageManager` field naming pnpm 11, are both
  unverified. Both surface immediately on the first local install.
- Version numbers here are true of 2026-08-03. `typescript-eslint` publishes frequently, and its
  TypeScript bound is the single fact most likely to move — a later release accepting TypeScript 7
  would reopen that update without anything else changing.
