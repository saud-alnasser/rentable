---
status: resolved
blocked-by: [08, 09]
---

# feat(organization): the owner renames the organization

Authoritative: [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/spec]], and [[efforts/851-the-way-out-the-password-fields-and-the-organizations-name/plan]] (*The organization's signed name*, the rename and the tab).

## Outcome

The organization tab opens with a card showing the organization's name; the owner alone sees an edit control there, opening a light form that renames the organization. The rename writes the signed row and the unsigned column, updates the owner's record, the shell and the switcher at once, and reaches new links; old links keep working.

## Acceptance Criteria

Traces requirements 22 to 28, and criteria 22 to 28.

- [x] `organization_rename(name)` behind a flagless `require_owner_alone` and a new `Gate::OwnerAlone` in the command gate table; the router uses `procedure.member`; a non-owner is refused with `name_sealed` unchanged (criterion 24).
- [x] Rust trims, refuses empty (`OrganizationNameMissing`) and over 120 characters (new `OrganizationNameTooLong`), for rename and for setup (criterion 23); the form refuses with the walk's two sentences.
- [x] The rename writes the signed row and `organization.name_sealed` with one sealed value, pushes, updates the owner's held entry, and returns the whole `OrganizationState`; the tab, the shell and the switcher read the new name with no restart (criterion 25).
- [x] Rust tests: a link minted before the rename still joins and the joined machine names the new name (criterion 27); one minted after carries the new name (criterion 28).
- [x] The organization tab's first card shows the name; the edit control is drawn for an owner session and not for a manager or a member holding every flag (criterion 22); the form follows `workspace/component/rename-form.svelte`, and an unchanged name closes with no write.
- [x] Every new string in English and Arabic; a changeset.

## Relevant areas

- `apps/desktop/tauri/src/organization/{workspace/mod.rs (require_owner),mod.rs (gates),setup/mod.rs,store/setup.rs}`, `src/lib/api/trpc.ts`
- `apps/desktop/src/lib/organization/{router.ts,query.ts,component/settings-organization.svelte}`, `src/lib/organization/workspace/component/rename-form.svelte`

## Constraints

- No `renameOrganization` flag (spec, *Constraints*).
- The card uses the settings group and row blocks the tab already uses.
