---
status: resolved
blocked-by: ['11']
---

# feat(organization): a member joins by opening a link

## Outcome

Opening an invite link on a machine that has never seen the organization registers it there and
adds it to the login screen's list. The link carries what the machine needs to find the
organization and nothing that is useful on its own. Joining consumes the invitation, builds the
member's vault under the generated password, and leaves them required to change it.

## Acceptance Criteria

Traces requirement 8, requirement 15, requirement 21 and requirement 23 of
[[efforts/819-an-organization-hosts-its-own-workspaces/spec]], and its criterion 8, criterion 15
and criterion 21.

- [x] Opening the link on a machine with no prior state adds the organization to the login screen's
      list, with its name and remote, and the organization's verifying key is pinned locally from
      the link rather than read from the database it protects.
      *Verified: `organization/join.rs::join` writes a `JoinedOrganization` into the machine's
      `RemoteSyncStore.organizations` with the id, name, remote and verifying key copied from the
      decoded link, which is what `organization_state_get` lists for the sign-in card.
      `opening_the_link_on_a_fresh_machine_records_the_organization_as_the_link_spelled_it` starts
      from an empty second-machine store and asserts every field of the record against the link.
      `a_link_carrying_another_key_is_refused_by_the_rows_it_finds` replaces the link's key with a
      stranger's and has both `inspect` and `join` refused on verification, which is what pinning
      from the link rather than reading from the database means.*
- [x] **Holding the link alone yields nothing about who is in the organization.** Given the link's
      contents and the read-only credential it carries, no email address, display name, or
      workspace name is readable from a populated database. A test asserts it against real rows.
      *Verified: `the_rows_a_link_holder_reads_carry_no_email_no_name_and_no_workspace_name` reads
      every text and blob cell of every table an actual first run, workspace creation and
      invitation wrote, and asserts the member's email, display name, the workspace name, the
      owner's password and the generated password appear in none of them, and that the link text
      carries none of them either; the organization's name is the one name the link carries, which
      is requirement 23's. `inspect` reads with the pinned key and answers the name and the
      standing, and nothing else crosses.*
- [x] Joining requires the generated password as well as the link, and neither alone opens the
      invitation payload.
      *Verified: `join` opens the payload with `open_invitation(link secret, password)` and refuses
      before any write when it does not open; `neither_half_alone_joins_and_a_wrong_password_records_nothing`
      joins with the link and a wrong password and is refused with nothing recorded and the
      invitation still open, then joins with the organization's own link, which carries no half,
      and the right password, and is refused naming the organization. The other direction, the
      secret without the password, is ticket 11's
      `an_invitation_makes_a_member_a_link_and_a_password_and_both_halves_open_it`.*
- [x] A consumed invitation cannot be consumed a second time, and a test drives the second attempt.
      A lapsed or revoked one is refused with the organization still named, which is ticket 11's
      criterion seen from this side.
      *Verified: `a_spent_lapsed_or_revoked_invitation_is_refused_and_the_organization_is_still_named`
      joins once, drives the second attempt with the same link and password and has it refused as
      `Forbidden` naming the organization and saying already used, with the machine's record not
      written twice; then invites two more members, moves the clock past the lifetime for one and
      revokes the other, and has `inspect` answer `Lapsed` and `Revoked` with the name and `join`
      refuse each naming the organization. The join screen draws the three refusals as sentences
      of the locale with the organization named above them, and `join-screen.svelte.test.ts`
      asserts each with no field drawn.*
- [x] The joined member's vault is written, their grants are sealed to their new public key, and
      `must_change_password` is set, which ticket 13 is what clears.
      *Verified: under ticket 11's design the inviter writes the vault under the generated password
      and seals the content key and every grant to the member's public key at invitation time,
      which is what lets a grant be made without the member present; joining opens that vault with
      the password through the same `session::sign_in` every launch uses. The fresh-machine test
      asserts the session holds the workspace credential the inviter granted, that the slot holds
      the member's own organization credential on the way out, and `must_change_password` is set.
      Clearing it is ticket 13's.*
- [x] The link opens the application. How a link reaches the application on each platform is a
      decision this ticket makes and records; a link that only works when pasted into a field is a
      worse answer than one that does not, and either is better than an undocumented one.
      *Verified: decided and recorded in `organization/join.rs`'s module note and in
      `references/tauri.md`, *Open the app with a join link*. The `rentable` scheme is declared
      under `plugins.deep-link.desktop.schemes` in `tauri.conf.json`, which the installer registers
      on Windows and Linux and `Info.plist` carries on macOS; `lib.rs` registers it for the running
      executable in a development build (`register_all`), and `tauri-plugin-single-instance` with
      its `deep-link` feature forwards a second launch's link to the instance already running. A
      link is held in `AppState.arriving_link` and announced as the `organization:link` event;
      the shell takes the held one once after startup and listens for the rest, and puts
      `/organization/join` on with the link already read. The pasted field on the same screen is
      the fallback, and the sign-in card offers the screen in both of its situations. Not driven
      end to end on this machine in this wave; the app run stands offered.*
- [x] Both locales, both directions.
      *Verified: `organization.join.*` (17 strings, one with a `{name}` parameter) and
      `layout.signIn.openInvitation` in `en/index.ts`, `ar/index.ts` and the generated
      `i18n-types.ts`; `pnpm check` 0 errors. The link field is `dir="ltr"` in either direction,
      and `join-screen.svelte.test.ts` renders the password step and a refusal in Arabic.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test` and `cargo clippy` pass.
      *Verified: 2026-09-12. `pnpm check` 0 errors, 0 warnings; root `pnpm lint` clean; `pnpm test`
      900 node tests and 30 component tests pass; `vite build` builds. `cargo test
      --test-threads=1` 321 passed, 0 failed, 8 ignored; `cargo clippy --all-targets` the same five
      warnings that stand at the branch point, none in `organization/`; `cargo fmt --check` clean.*

## Relevant areas

`apps/desktop/src/lib/organization/` holds the join screen beside the setup walk from ticket 09 and
the sign-in from ticket 10, all three of which are the same few screens seen from different
starting states.

`apps/desktop/tauri/src/organization/store.rs` holds `invitation` with its `sealed_payload`,
`expires_at` and `consumed_at`. The local list of joined organizations is machine-local and is the
same record ticket 10 reads at sign-in.

`tauri-plugin-opener` is already a dependency, used to open the browser for Google sign-in. It
opens links; receiving one is the other direction and is what needs deciding here.

## Constraints

- **[[rules/credentials]], *Client boundary*.** The link's contents are parsed in Rust. The web
  layer receives the organization's name and whether the invitation is still good.
- **A read-only credential in the link is deliberate and bounded.** The spec's third assumption is
  that read-only is enough for a member to reach the organization database before their vault is
  open. If it turns out a joining member must write first, requirement 15's protection is harder
  and that is a finding worth raising rather than working around quietly.
- **The invitation's signature is verified before it is consumed.** An unsigned or badly signed
  invitation is refused.

## Notes

Requirement 6 is nearly this ticket seen from the owner's side, and ticket 18 is what proves it. A
join implementation that only works for a member and not for an owner returning on a new machine
will be found there rather than here.
