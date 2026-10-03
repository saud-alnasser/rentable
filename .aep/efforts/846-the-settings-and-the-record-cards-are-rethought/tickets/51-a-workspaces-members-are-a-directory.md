---
status: open
blocked-by: []
---

# feat(desktop): a workspace's members are a directory, added in a sheet and edited in one

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03, verbatim: "in the workspace details page the top bar needs to be like and records directory view and the plus is what opens a sheet and the user simlier ot the contract choooses members then adds them to the list and completes the addtion or something simlijer; for elispases the card in a workspaces when clicked it should open the tailor acess here; and the options in the card on the workspace view details should be edit permissions, remove; where edit permissions is only permissions on that workspace switches on a sheet; where open member is no longer there; so in a workspace the details page it has a searchbar filter,sort add button on the tray; then grid of cards like now; a card when clicked it opens the edit permissions option sheet; and the eliapess show edit permissions and remove options only; the edit permissions is a sheet with the permissions for this workspace only swtiches to edit and it sayss it is an override on the org and role pemirsisons for this workspace; and the plus button opens a form or sheet and a search filed that dropdown filtered with the searched and added muliipjle members; it only shows members that are not in the workspace and simply add them to the workspace to complete the operation". The workspace page (tickets 49, 50) keeps its header of facts and acts and replaces the find-a-member field: (1) its members are a record directory in the record directories' manner, the same tray (`DirectoryTray`: search filtering by username, sort, and the plus as the add act) over the grid of member cards, as a record page that holds a directory draws one. (2) The plus opens an edge sheet in the form surface's manner, as the contract form chooses its tenant: a search field whose dropdown lists only members not in the workspace, filtered by what is typed; choosing adds the member to a list of chosen members in the sheet (each removable before saving); the sheet's one save grants them all, refused with its reason as today (a reader without `grantWorkspace` or holding it read only has the plus refused with the reason). (3) Pressing a card opens *edit permissions* for that member here. (4) A card's ellipsis menu holds only *edit permissions* and *remove* (red, confirmed, as ticket 50); *open member* goes. (5) *Edit permissions* is a sheet of this workspace's permissions only, as switches, saying in its description that they override the organization's and the role's permissions for this workspace; it saves through the tailoring mutation the member's card uses today, refused as there (no `overrideMember`, or a member at or above the reader).

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 2, 16, 18 and 19.

- [ ] A page test: the members directory has the tray with search (filters by username), sort, and the plus; no find-a-member field remains; the grid and empty state as ticket 50.
- [ ] A page test: the plus opens the add sheet; its search lists only members not in the workspace, filtered; choosing adds to the chosen list and removes from the dropdown; a chosen member can be taken off; save grants every chosen member and closes; a refusal says its reason; the plus is refused with its reason for a reader who cannot grant; en and ar.
- [ ] A page test: pressing a card opens edit permissions for it; the menu holds exactly edit permissions and remove; remove asks first; open member is absent; the dangerous-acts guard passes.
- [ ] A sheet test: edit permissions lists this workspace's permission switches only, its description says they override the organization's and the role's permissions here, saving writes through the tailoring mutation, and it is refused with its reason where the reader may not.
- [ ] Desktop check, node and vitest; design tests; eslint and prettier on changed files; [[rules/interface]] and [[contexts/desktop/components]] say all this; `validate.mjs` passes.

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/` (page, holders, add-holder, acts), `apps/desktop/src/lib/organization/access/component/tailoring.svelte`, the directory tray and the contract form's tenant chooser as patterns

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
- No schema change; no change to what the router or Rust allows.
