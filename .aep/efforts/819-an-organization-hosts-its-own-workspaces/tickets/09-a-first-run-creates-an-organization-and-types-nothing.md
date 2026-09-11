---
status: resolved
blocked-by: ['04', '08']
---

# feat(organization): a first run creates an organization and types nothing

## Outcome

An owner installs the application, names their organization, sets a password, and grants the
consent in a browser over a group they prepared in Turso's dashboard. The application discovers the
organization slug, provisions the organization database into that group, writes the organization
key and the owner's member row, and the owner is signed in. No token, slug, group name, or URL is
typed into this application.

## Acceptance Criteria

Traces requirement 3, requirement 21 and requirement 22 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 3, criterion 21
and criterion 22.

- [x] A walk-through test of the setup path asserts that **the only text entered is the
      organization's name and a password**. It asserts over the fields the walk presents, so a
      field added later that asks for a slug fails the test rather than passing review.
      *Verified: the walk is data before it is a screen. `src/lib/organization/setup.ts` describes the
      three steps with the fields each presents, and `component/setup-walk.svelte` draws its inputs
      from that description. `tests/setup.test.ts` asserts `fieldsPresented()` is exactly
      `['name', 'password']` and that no field matches slug, group, token, url, host or secret;
      `tests/setup-walk.svelte.test.ts` renders the naming step and asserts the document holds exactly
      two inputs, `name` and `password`, and renders the connect step and asserts it holds none. A
      field added later fails one or both.*
- [x] The application provisions into the organization holding the selected group, without asking,
      because there is nothing to ask: a group-scoped token cannot list organizations and cannot tell
      a personal account from a team one. **The screen states what succession costs before the
      organization is created**, in every case rather than only for a personal account, and names
      group transfer as something the customer performs in Turso rather than something offered here.
      A test covers the statement being shown and asserts no organization listing is attempted.
      *Verified: `organization/setup.rs` never lists organizations: it discovers the slug through
      `discovery::organization`, or creates the first database through the MCP server on an empty group
      and reads the slug off the listing that follows, and provisions into that. `tests/router.test.ts`
      pins the router's four procedures by name and that none lists anything; the Rust `platform.rs` test
      walks every request and fails on `/v1/organizations`. The succession statement is the connect
      step's `succession` statement, shown before any field is typed:
      `statementsBeforeCreation()` includes it, the component test finds its text on the connect step,
      and `the_succession_statement_names_turso_as_where_a_group_moves_in_both_locales` asserts both
      locales name Turso as where a group moves and say rentable does neither.*
- [x] **The group preparation is explained, not asked for.** The setup walk tells the owner to
      create an empty group in Turso's dashboard and why it matters, before sending them to the
      consent. A test asserts the walk presents no field for it, so explaining it never becomes
      asking for it.
      *Verified: the connect step's `groupPreparation` statement tells the owner to create an empty group
      in Turso's dashboard and why, with an `open turso dashboard` action beside the consent. The step
      declares `fields: []`, `setup.test.ts` asserts the explaining step asks for nothing, and the
      component test asserts the connect step renders no input at all.*
- [x] The organization key is generated here and the owner's certificate is issued under it. Where
      the organization key lives is a decision this ticket makes and records in the commit; it is
      not in the database it protects.
      *Verified: **the organization key is derived from the owner's vault secret and stored nowhere**, and
      so is the owner's administrator signing key; `MemberSecretKey::derive_seed` (HKDF-SHA256 over the
      X25519 secret with a purpose string) is the derivation and `setup.rs`'s module comment records why
      the two other homes were rejected: a column is the database the key protects, and this machine's
      keyring fails requirement 6 on the second machine. A derived key follows the password to any
      machine, survives a password change because a change re-seals the same secret, and is replaced by
      a reset, which is when certificates are reissued. The owner's certificate is issued under it at
      creation and written first. `a_first_run_creates_the_database_the_keys_the_rows_and_the_link...`
      opens the owner's vault with the password, derives the key, and asserts its verifying key is the
      one the join link pinned; `a_seed_follows_from_the_secret_and_the_purpose_and_survives_a_password_change`
      pins the derivation. Recorded in the commit as the ticket asks.*
- [x] The join link the owner can hand out is produced, carrying the organization's verifying key,
      its remote URL, and a read-only credential, and carrying nothing that is useful alone.
      *Verified: `organization/link.rs` is `JoinLink { organization_id, verifying_key, remote_url,
      read_only_credential }` under `rentable://join/<base64url>`; the read-only credential is minted
      with `never` as its lifetime so the link does not go stale (requirement 23).
      `a_link_carries_the_four_fields_and_nothing_else` pins the field set; the first-run test decodes
      the link and asserts the remote and the credential are the organization database's. What the
      link is useful for alone is a read of sealed, signed rows, which ticket 08's secrecy test covers.*
- [x] Every screen this adds renders correctly in Arabic and in English, right to left and left to
      right, and the strings are keyed the way this repository already keys them.
      *Verified: the strings are under `organization.setup.*` and `layout.signIn.setUpOrganization` in both
      `en/index.ts` and `ar/index.ts`, keyed as the neighbouring `organization.disconnect*` keys are, and
      `i18n-types.ts` carries them in the generator's own format. The component test renders the naming
      step and the done step under `ar` and asserts the same two fields, the Arabic title, and `dir="ltr"`
      on the link, which is a machine's string ([[rules/frontend]], *i18n*). The surface is the shared
      `StandaloneSurface`, which every other application screen already renders in both directions.*
- [x] A consent the human abandons leaves no half-created organization: either the run completes or
      it leaves nothing, and a test drives the abandonment.
      *Verified: `an_abandoned_consent_leaves_a_first_run_nothing_to_spend_and_nothing_is_created` in
      `consent.rs` drives a consent to `Abandoned` through the scripted authorization server and asserts
      `setup::authority()` refuses with `NotConfigured` naming the consent, with no request made. The
      screen shows `consentAbandoned` and offers the consent again, which the component test covers.
      And a run that fails after the database exists leaves nothing either:
      `a_first_run_that_fails_after_the_database_exists_leaves_nothing` refuses the first mint and
      asserts the database is deleted as `CreatedAndUnreferenced`, the replica file is gone, and this
      machine records no organization.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: `pnpm check` 0 errors over 9219 files; root `pnpm lint` (prettier and eslint) clean;
      `pnpm test` 891 node tests and 11 component tests pass; `vite build` builds;
      `cargo test --manifest-path ./apps/desktop/tauri/Cargo.toml -- --test-threads=1` gives
      `289 passed; 0 failed; 7 ignored`; `cargo clippy --all-targets` the same five pre-existing warnings;
      `cargo fmt --check` clean. `pnpm build` through `tauri-with-env.mjs` cannot run in this deep
      worktree for the pnpm path reason the run log already records; `vite build` is what it wraps.*

## Relevant areas

`apps/desktop/src/lib/organization/` is new and is where the setup walk lives.
`apps/desktop/src/routes/` is where it is reached from, and the current first-run path is the one
being replaced.

`apps/desktop/tauri/src/sync/turso/consent.rs` from ticket 03 supplies
`organization_consent_begin` and `organization_consent_result`, and ticket 20 added
`organization_disconnect` beside them. **The result carries no organizations.** It returned a list
with `is_personal` on each until ticket 20 removed it, because a group-scoped token answers 403 at
that endpoint, and the amended requirement 22 has no choice for it to inform: the organization is
whichever holds the selected group. Ticket 21 is what puts the slug on that result.

The disconnect copy exists in both locales and renders nowhere. This ticket owns the screens, so it
is this ticket that gives it somewhere to appear.

`apps/control-plane/src/workspace/migration.ts` shows how the control plane applies
`@rentable/workspace-migrations` and mints a short-lived credential for it,
`MIGRATION_TOKEN_LIFETIME = '30m'`. The organization database's own schema is created here; a
workspace's is ticket 14's.

## Constraints

- **[[rules/credentials]], *Client boundary*.** The web layer drives the walk and observes
  outcomes. The consent, the token, the organization key, and the password all stay in Rust.
- **Requirement 22 is not a question put to the human.** The application selects, and where it
  selects the weaker option it says what that costs. A picker asking somebody to choose an
  organization slug fails criterion 3.
- **Turso account creation is out of scope.** A person without an account makes one on Turso's own
  screen. Do not wrap, mirror, or explain it beyond a sentence.

## Notes

This is the first ticket a human can see anything from, and it is the first that costs a live
account something. Ask before running it end to end.

If ticket 04 found the consent refused, this ticket's walk gains a token paste and loses criterion
3, and everything else about it is unchanged. That substitution is the fallback the spec's first
risk describes.
