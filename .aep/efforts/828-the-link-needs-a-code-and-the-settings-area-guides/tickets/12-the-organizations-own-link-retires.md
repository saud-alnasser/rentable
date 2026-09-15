---
status: resolved
blocked-by: ['10', '11']
---

# feat(organization): the organization's own link retires

## Outcome

No never-expiring credential is minted, stored, shown or accepted. Every link the application
makes is an invitation, a reset or a second-machine link, sealed under its code; the sync
section's link block is gone; the connect screen has no code-free path. The rule, the context
and 826's spec say so with a dated correction.

## Acceptance Criteria

Traces requirement 16 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 16
and 12.

- [x] Rust: `LINK_CREDENTIAL_LIFETIME` and the second mint in `setup::finish` go;
      `link_credential_sealed` leaves `SCHEMA`, the organization record, `write_organization`
      and the select, and a replica still carrying the column opens (a test opens one);
      `JoinLink` loses `Credential::Clear`, its credential is the sealed payload and its `half`
      is required, so `decode` refuses a text with no half as not a link; `invite::organization_link`
      becomes `invite::locator` of four clear fields which the invitation, the reset and the
      machine link seal a payload onto; `connect::connect` takes the locator and the credential
      its caller unsealed; `connect::refuse_sealed`, `CODE_NEEDED`, `organization_connect` and
      `organization_own_link` go, and `lib.rs` follows. `grep` over `apps/desktop/tauri/src` for
      `LINK_CREDENTIAL_LIFETIME`, `link_credential_sealed`, `Credential::Clear` and `"never"`
      finds nothing outside a docstring naming what was; the three tests that used the link go
      and every fixture builds from the locator.
      *Verified 2026-09-16 on the effort branch: `grep -rn` over `apps/desktop/tauri/src` for
      `LINK_CREDENTIAL_LIFETIME`, `Credential::Clear`, `"never"`, `organization_own_link` and
      `fn organization_connect` finds nothing, `refuse_sealed` one docstring, and
      `link_credential_sealed` the `invite.rs` docstring plus the `store.rs` test that opens a
      replica still carrying the column; `cargo test -- --test-threads=1`: `379 passed; 0
      failed; 10 ignored`, with
      `a_replica_still_carrying_the_link_credential_column_opens_and_reads`,
      `a_text_with_no_half_and_a_blank_half_are_not_links` and
      `a_connect_with_no_credential_in_hand_records_nothing` ok.*
- [x] Boundary and surfaces: `LinkKind` loses `organization` and `linkKind` its case;
      `organization_connect` and `organization_own_link` leave `host.ts`, `tauri.ts`,
      `router.ts` and `query.ts`; `organization-link.svelte`, the sync section's link block and
      the strings only it read go from both locales; `area.svelte.test.ts` finds no link block for
      the owner; `connect-screen.svelte.test.ts` finds no code-free path; `router.test.ts` pins
      the procedures.
      *Verified: `LinkKind` is invitation or machine on both sides; `useOrganizationLink`,
      `organization_own_link` and `dashboard.linkTitle` are absent from `apps/desktop/src`;
      `organization-link.svelte` is deleted; `area.svelte.test.ts` asserts no link block for
      the owner or an administrator; `connect-screen.svelte.test.ts` asserts no code-free
      path; `router.test.ts` pins the procedures; types regenerated with no drift.*
- [x] [[rules/credentials]], [[contexts/desktop/organization]] (the *Link* entry and the boundary
      paragraph) and 826's requirement 10 carry a second dated correction saying no link carries
      a legible credential and the owner's way back is the account; the context's sentence that
      a lock-out rotates the organization database is corrected as the research file found; the
      changeset sentence of ticket 06 naming the link as the recovery copy is rewritten; the index
      is regenerated.
      *Verified by reading: 2026-09-16 corrections in `rules/credentials.md`,
      `contexts/desktop/organization.md` (the *Link* entry, the boundary paragraph, and the
      rotation sentence corrected in place citing finding 5) and 826's requirement 10 and
      criterion 10; the changeset's first and fourth paragraphs no longer name the link as the
      recovery copy; `validate.mjs`: `262 artifacts checked, no failures`.*
- [x] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.
      *Verified in the run's worktree: `pnpm check` exit 0 (desktop `9303 FILES 0 ERRORS 0
      WARNINGS`), `pnpm lint` exit 0, `pnpm test` exit 0 (desktop `185 passed`); `cargo test`:
      `379 passed`.*

## Relevant areas

`apps/desktop/tauri/src/organization/{setup,store,link,invite,connect,machine,join,command}.rs`,
`apps/desktop/tauri/src/lib.rs`, `apps/desktop/src/lib/platform/{host,tauri}.ts`,
`apps/desktop/src/lib/organization/{router,query,connect}.ts`,
`apps/desktop/src/lib/organization/component/{organization-link,connect-screen}.svelte`,
`apps/desktop/src/lib/settings/component/area.svelte`, `apps/desktop/src/lib/i18n/{en,ar}/index.ts`,
`.aep/rules/credentials.md`, `.aep/contexts/desktop/organization.md`, 826's spec,
`.changeset/a-link-needs-its-code.md`, and the tests beside each.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *The
  organization's own link retires*, and finding 6 of the research file it cites.**
- **Nothing under a signature changes.**
- **A replica carrying the dropped column is opened, never refused**: `forget` gains no sign.

## Notes

- *2026-09-16, at integration.* The grep half of the first criterion and its test half cannot
  both hold literally: the test that opens a replica still carrying the column has to name it;
  the test stands. `OrganizationCreated` lost `joinLink` and `LinkShape.expiresAt` is no longer
  optional, since with `half` required neither had a producer. The changeset's first paragraph
  also named the link as the recovery copy and was cut; 826's criterion 10 carries a dated
  correction beside requirement 10's. `connect::connect` takes the credential its caller
  unsealed and spends it on one guard, a blank credential refused by name. The spec's own
  criterion 4, superseded by requirement 16, is struck with a dated note at integration.
