---
status: open
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

- [ ] Rust: `LINK_CREDENTIAL_LIFETIME` and the second mint in `setup::finish` go;
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
- [ ] Boundary and surfaces: `LinkKind` loses `organization` and `linkKind` its case;
      `organization_connect` and `organization_own_link` leave `host.ts`, `tauri.ts`,
      `router.ts` and `query.ts`; `organization-link.svelte`, the sync section's link block and
      the strings only it read go from both locales; `area.svelte.test.ts` finds no link block for
      the owner; `connect-screen.svelte.test.ts` finds no code-free path; `router.test.ts` pins
      the procedures.
- [ ] [[rules/credentials]], [[contexts/desktop/organization]] (the *Link* entry and the boundary
      paragraph) and 826's requirement 10 carry a second dated correction saying no link carries
      a legible credential and the owner's way back is the account; the context's sentence that
      a lock-out rotates the organization database is corrected as the research file found; the
      changeset sentence of ticket 06 naming the link as the recovery copy is rewritten; the index
      is regenerated.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

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
