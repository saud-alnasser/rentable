---
status: resolved
blocked-by: ['13', '15', '16', '17', '18']
---

# chore(desktop): the control plane and Google sign-in are retired

## Outcome

`apps/control-plane/` no longer exists as an application, Google sign-in is gone from every build,
and what the control plane knew that is still true survives as `packages/turso-platform`. This is
last, deliberately: until everything above it lands, the control plane is the only thing that signs
anybody in.

## Acceptance Criteria

Traces requirement 19 and requirement 20 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 19 and
criterion 20.

- [x] **No Google OAuth client id, secret, or scope remains in the tree, and a test fails if one
      returns.** The client id and secret ship in every build today and its only remaining job is
      answering who somebody is, which the organization now answers.
      *Verified: `apps/desktop/tauri/src/sync/google/` is deleted with `sync/{control,session,sign_in}.rs`;
      the loopback server it held is `sync/test/server.rs`. `src/lib/platform/tests/no-google.test.ts`
      walks the desktop's `src/`, `tauri/src/`, `Cargo.toml`, `tauri.conf.json`, `.env.example`
      and `package.json`, plus `packages/` and `.github/`, for `GOOGLE_OAUTH_CLIENT_ID`,
      `GOOGLE_OAUTH_CLIENT_SECRET`, `accounts.google.com/o/oauth2`, `googleapis.com/auth/` and the
      keyring service `rentable.google-drive`, and fails on any; it caught one literal in a comment
      of `consent.rs` on the first run, which is what it is for. `oauth/` keeps the provider-agnostic
      protocol, whose example endpoints are `https://auth.example/...`.*
- [x] `apps/control-plane/` no longer exists as an application. `pnpm build` and the `integration`
      gate pass without it.
      *Verified: `git rm -r apps/control-plane` (73 files); root `package.json` loses
      `build:control-plane`, `dev:control-plane` and `db:*:control-plane`; `integration.yml` loses the
      control plane build step; `pnpm-lock.yaml` regenerated. `pnpm --filter ./apps/desktop build:web`
      (vite) built clean; `pnpm exec prettier --check .` passes. The full `pnpm build` bundles Tauri
      installers, which this machine does not run for a gate; `build:web` is what `integration` runs.*
- [x] `packages/turso-platform` holds the Platform API knowledge in TypeScript, so a hosted tier
      remains possible later without being planned. **It is not on the credential path** and
      nothing in the desktop imports it: the desktop's client is the Rust one from ticket 05.
      *Verified: `packages/turso-platform/{index.ts,migration.ts,failure.ts}` are the control
      plane's `workspace/turso.ts`, `workspace/migration.ts` and its `Refusal`, with their tests
      (21 pass, `pnpm check` clean). `grep -rn turso-platform apps/` finds only comments; the
      desktop's `package.json` does not depend on it, and `tsconfig.json`'s comment says why.*
- [x] `apps/desktop/.env.example` loses `RENTABLE_CONTROL_PLANE_URL`, `GOOGLE_OAUTH_CLIENT_ID` and
      `GOOGLE_OAUTH_CLIENT_SECRET`. `TAURI_UPDATER_PUBLIC_KEY` stays.
      *Verified: the file names `DATABASE_URL` and `TAURI_UPDATER_PUBLIC_KEY`, and, commented out,
      the live-test variables (`RENTABLE_LIVE_TURSO`, `TURSO_CONSENT_TOKEN`, `TURSO_ORG`,
      `TURSO_GROUP`, and `TURSO_API_TOKEN` for the older #552 tests). The guard test above would fail on either Google name returning.*
- [x] `[[rules/testing]]`, under *Tests that reach a live remote*, loses the two admissions that
      belonged to `apps/control-plane/` and keeps its count honest. Ticket 01 added four; this
      removes two, and the section says the count is the thing that goes stale.
      *Verified: the heading sentence counts six sets, the two control plane admissions are recorded
      as retired on 2026-09-12 in the paragraph that held them, and the rule's `paths` swap
      `apps/control-plane/**` for `packages/turso-platform/**`. `validate.mjs`: 193 artifacts, no
      failures.*
- [x] Every reference to the control plane in `.aep/` prose that is now false is corrected:
      `[[contexts/repository]]`, `[[contexts/desktop/remote-sync]]`, `[[references/turso]]` and
      `[[rules/credentials]]` are where to start looking. A retired application named as present is
      a document that misleads the next session.
      *Verified: those four, plus `contexts/desktop/persistence`, `rules/module-layout`,
      `references/{pnpm,turborepo,changesets,drizzle-kit,tauri}`, and the new
      `contexts/desktop/organization`; `references/fastify` is deleted, because no Fastify code
      remains for its `use-when` to fire on. `grep -rn "control plane" .aep/{rules,contexts,references}`
      leaves only past-tense sentences. The same pass went through source comments in
      `apps/desktop` and the two packages, which had named the control plane as the authority on
      renames and permissions; they name the signed row and the organization now. `CLAUDE.md` and
      `AGENTS.md` no longer say "optional Google Drive backup". `index.md` regenerated.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: `svelte-check` 0 errors; `eslint .` clean; node tests 893 pass, vitest 45 pass;
      `packages/turso-platform` 21 pass; `cargo test` 274 pass / 10 ignored, four runs in a row
      after the consent and platform tests were made to take turns on the shared test credential
      store (they raced, and two failed at random); `cargo clippy --all-targets` at the same five
      pre-existing warnings; `cargo fmt --check` and `prettier --check .` clean. `pnpm test` through
      turbo does not run in this worktree (a pnpm shim path defect unrelated to the change), so each
      package was run directly.*

## Relevant areas

`apps/control-plane/` in full. `apps/control-plane/src/workspace/turso.ts` and `migration.ts` are
what becomes the package; `src/database/schema.ts` and `src/tests/boundary.test.ts` are the record
of what was learned and go with the application.

`apps/desktop/tauri/src/sync/google/` is what Google sign-in leaves behind, and ticket 02 already
separated what is generic from what is Google's, so this deletes only the second half. The keyring
service `rentable.google-drive` goes with it.

`apps/desktop/.env.example` is the setup burden the spec's problem statement names, and this is
where it shrinks.

## Constraints

- **[[references/turso]], *Never run*: do not delete `control-plane` or `control-plane-live-test`.**
  Retiring the application does not touch the databases. They are the human's and the spec puts the
  author's own hosted workspace out of scope by name.
- **Nothing is deleted while it is still the only thing that works.** Every ticket above must be
  resolved. If any of them parked, this one waits rather than proceeding around it, because the
  spec's fifth risk is exactly this: if the effort lands half-built it lands unusable.
- **A changeset rides with this commit**, as it does with every change here.

## Notes

The five edges are not conservatism. Deleting the only working account system is the one act in
this effort that cannot be half-done, and each of those tickets is a piece of what replaces it.

Google Drive sync went at #554; sign-in is what survived that retirement, and this is the second
and last one.
