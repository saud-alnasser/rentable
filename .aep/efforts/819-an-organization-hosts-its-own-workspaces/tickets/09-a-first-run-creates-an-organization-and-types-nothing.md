---
status: open
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

- [ ] A walk-through test of the setup path asserts that **the only text entered is the
      organization's name and a password**. It asserts over the fields the walk presents, so a
      field added later that asks for a slug fails the test rather than passing review.
- [ ] The application provisions into the organization holding the selected group, without asking,
      because there is nothing to ask: a group-scoped token cannot list organizations and cannot tell
      a personal account from a team one. **The screen states what succession costs before the
      organization is created**, in every case rather than only for a personal account, and names
      group transfer as something the customer performs in Turso rather than something offered here.
      A test covers the statement being shown and asserts no organization listing is attempted.
- [ ] **The group preparation is explained, not asked for.** The setup walk tells the owner to
      create an empty group in Turso's dashboard and why it matters, before sending them to the
      consent. A test asserts the walk presents no field for it, so explaining it never becomes
      asking for it.
- [ ] The organization key is generated here and the owner's certificate is issued under it. Where
      the organization key lives is a decision this ticket makes and records in the commit; it is
      not in the database it protects.
- [ ] The join link the owner can hand out is produced, carrying the organization's verifying key,
      its remote URL, and a read-only credential, and carrying nothing that is useful alone.
- [ ] Every screen this adds renders correctly in Arabic and in English, right to left and left to
      right, and the strings are keyed the way this repository already keys them.
- [ ] A consent the human abandons leaves no half-created organization: either the run completes or
      it leaves nothing, and a test drives the abandonment.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.

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
