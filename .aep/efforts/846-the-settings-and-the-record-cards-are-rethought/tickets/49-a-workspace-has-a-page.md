---
status: resolved
blocked-by: [48]
---

# feat(desktop): a workspace's members are managed on a page of its own

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

The human's walk of 2026-10-03 ("manage members in the workspaces the form looks bad the switch it needs to be a better looking maybe a page details like how records have pages record and dicreocty of members and at the top information"). The workspace card's *members* act opens a workspace page the way a complex or tenant record opens its details page (`routes/complexes/[id]` and `lib/complex/component/details.svelte` are the pattern; a route under settings, with back to the workspaces section): at the top, what the workspace is (its name, open here or not, the reader's access, when it was made, how many hold it), in the record pages' header manner with the card's acts (rename, export, import, delete as allowed); below, a directory of the members who can hold it, in the members directory's manner, each with a well-drawn in-or-out control (the switch reworked, or a clearer control the components context names) and the *custom here* mark, saving as [[rules/interface]] says (at once per change, or under one save if the refusals need it). The refusals, their reasons, the owner and reader exclusions and the Rust checks are unchanged. The dialog it replaces goes, its tests moved to the page.

## Acceptance Criteria

Traces requirement 1 as revised 2026-10-03, and requirements 16, 18 and 19.

- [x] A route test: the workspace card's members act navigates to the workspace page; back returns to the workspaces section; an unknown id says so. *Verified: `vitest run src/lib/organization/workspace` (page and directory tests): the card and its members act navigate to `/settings/workspaces/ws-2`; back returns to `/settings?section=workspaces`; an unknown id says it was not found; 5 files, 111 passed with the act guard.*
- [x] A page test: the header shows the name, the open badge where open, access, made date and holder count with glyphs; its acts are the card's, refused as there. *Verified: the page test: the header carries the name, the open badge where open, the holder count, access and made date, each with its glyph, and the card's acts but members, refused as there.*
- [x] A page test: every holdable member is listed with an in-or-out control named for the member; changing one grants or withdraws through the same mutation; the refusals and their reasons hold; the owner and the reader are not listed; custom here marks the tailored. *Verified: the page test: every holdable member has a large switch named for them with its state in words; each change writes once through `useChangeAccess` and a refused one is put back; the not-held and grantWorkspace refusals hold; the owner and the reader are not listed; custom here marks the tailored.*
- [x] No access dialog remains for a workspace; desktop vitest, node tests and `pnpm check` pass. *Verified: `access/component/dialog.svelte` and its test are deleted; integrated desktop check 0 errors, node and vitest passed; design check 0 errors, node and vitest passed; the dangerous-acts guard passes.*
- [x] [[rules/interface]] and [[contexts/desktop/components]] say a workspace's members live on its page; `validate.mjs` passes. *Verified: rules/interface (Record surface, Row activation, members and access) and contexts/desktop/components say a workspace's members live on its page; `validate.mjs` passes.*

## Relevant areas

- `apps/desktop/src/lib/organization/workspace/`, `apps/desktop/src/lib/organization/access/component/{dialog,switches}.svelte`, `apps/desktop/src/routes/settings/`, the record details pattern in `apps/desktop/src/lib/complex/component/details.svelte`

## Constraints

- User-visible: it carries its own changeset ([[references/changesets]]).
- Choose components by [[contexts/desktop/components]].
- No schema change; no change to what the router or Rust allows.
