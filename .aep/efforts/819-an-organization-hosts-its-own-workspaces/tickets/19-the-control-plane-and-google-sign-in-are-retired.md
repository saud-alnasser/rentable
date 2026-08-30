---
status: open
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

- [ ] **No Google OAuth client id, secret, or scope remains in the tree, and a test fails if one
      returns.** The client id and secret ship in every build today and its only remaining job is
      answering who somebody is, which the organization now answers.
- [ ] `apps/control-plane/` no longer exists as an application. `pnpm build` and the `integration`
      gate pass without it.
- [ ] `packages/turso-platform` holds the Platform API knowledge in TypeScript, so a hosted tier
      remains possible later without being planned. **It is not on the credential path** and
      nothing in the desktop imports it: the desktop's client is the Rust one from ticket 05.
- [ ] `apps/desktop/.env.example` loses `RENTABLE_CONTROL_PLANE_URL`, `GOOGLE_OAUTH_CLIENT_ID` and
      `GOOGLE_OAUTH_CLIENT_SECRET`. `TAURI_UPDATER_PUBLIC_KEY` stays.
- [ ] `[[rules/testing]]`, under *Tests that reach a live remote*, loses the two admissions that
      belonged to `apps/control-plane/` and keeps its count honest. Ticket 01 added four; this
      removes two, and the section says the count is the thing that goes stale.
- [ ] Every reference to the control plane in `.aep/` prose that is now false is corrected:
      `[[contexts/repository]]`, `[[contexts/desktop/remote-sync]]`, `[[references/turso]]` and
      `[[rules/credentials]]` are where to start looking. A retired application named as present is
      a document that misleads the next session.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

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
