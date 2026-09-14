---
status: resolved
blocked-by: ['05', '08']
---

# feat(settings): one settings area replaces four pages

## Outcome

`/settings` is one surface with a section rail and seven addressable sections, the general,
you, updates and diagnostics sections drawn from the components that exist, the members,
workspaces and sync sections drawn from today's components until their tickets rebuild them;
the organization, workspace and account routes are gone, the command palette and the rail's two
menus open sections, and the page still opens signed out with only the sections that need no
session.

## Acceptance Criteria

Traces requirement 14 and requirement 17 of
[[efforts/826-the-organization-and-the-way-in-are-rethought/spec]], and its criterion 14 and
criterion 17.

- [x] `settings/section.ts` exports the ordered section list, `sectionOf(url)` (unknown or
      absent reads as `general`), `sectionsFor(session, holdsTursoAuthority)` as the plan's
      *Interfaces* gives it, and `withSection(name)` typed as `create-intent.ts` types
      `withCreateIntent`; tested under `node:test`.
- [x] `settings/component/area.svelte` is pure props (settings, session, `holdsTursoAuthority`,
      remote-sync state, members, the chosen section) and renders the title, the rail and the
      chosen section's blocks; `settings/component/rail.svelte` is a `nav` of anchors drawn as
      tabs above the body, as ticket 08's write-up settled it, the current one underlined and
      `aria-current`, read from
      `page.url.searchParams` and never from `isActiveRoute`.
- [x] `area.svelte.test.ts` renders an owner session and finds the seven sections in order,
      and a plain member session and finds `general`, `you`, `workspaces`, `sync`, `updates`,
      `diagnostics` and no `members`; with no session, `general`, `updates`, `diagnostics`.
- [x] `routes/settings/+page.svelte` owns the queries and renders the area; `routes/organization`,
      `routes/workspace` and `routes/account` do not exist; `OPENS_SIGNED_OUT` and
      `shell-surface.test.ts` are unchanged.
- [x] `layout/destination.ts`'s `secondaryDestinations` are the sections through
      `withSection`, `Destination.url` admits them, and `palette.svelte` keys rows on the full
      string; `palette.test.ts` and `navigation.test.ts` pass.
- [x] `workspace-menu.svelte` offers the switcher, a workspaces row to the workspaces section
      and the invite row; `account-menu.svelte` offers you, settings and sign out; both tests
      assert the rows and their hrefs.
- [x] The section names exist in both locales under `settings.section.*`, written, not copied.
- [x] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset rides with the change.

## Relevant areas

`apps/desktop/src/lib/settings/{section.ts,component/**}`, `routes/settings/+page.svelte`,
`routes/{organization,workspace,account}/+page.svelte`, `layout/{destination,palette}.ts`,
`layout/component/{palette,workspace-menu,account-menu,sidebar}.svelte`,
`layout/shell-surface.ts` (read), `packages/design/src/lib/create-intent.ts` (read),
`i18n/{en,ar}/index.ts`, and the tests beside them.

## Constraints

- **Read [[efforts/826-the-organization-and-the-way-in-are-rethought/plan]], *The settings area
  is one component, sectioned by `?section=`*, and ticket 08's write-up for the rail's look.**
- **[[rules/interface]]**: sections keep the `Field.Group`, `Field.Set`, `Field.Legend` trio
  the four pages use, so `Field orientation="responsive"` keeps its container.
- **[[rules/frontend]]**: the route owns queries, the area owns none; anchors carry resolved
  paths.
- **The members, workspaces and sync sections are stubs here**, composed from today's
  `members.svelte`, `invitations.svelte`, `workspaces.svelte`, `sync.svelte`,
  `organization-link.svelte`, `reconnect-authority.svelte` and `disconnect.svelte` with the
  organization page's dialogs moved with them, so the route works at this commit.

## Notes

Built by an implementer and landed on 2026-09-14; three em dashes in source comments were
replaced on landing. Departures from the literal criteria: the area takes `invitations`, the
in-flight markers and a callback per act beside the listed props, since the members stub draws
`invitations.svelte` and a pure-props component cannot own the mutations it does not run;
`section.ts` also exports `shownSection(section, offered)` so the tab marked is always the
section drawn; `sectionsFor`'s second parameter is taken and not read (the flag decides what
the sync section contains, which the area reads from its own prop), carried under an eslint
disable with the reason, for ticket 11 to use or the plan's Interfaces line to drop;
`useFetchInvitations` gained an `enabled` thunk so `/settings` opens signed out without
asking a member's procedure (ticket 04 removes the hook); `workspace/component/members.svelte`
resolves the members section since `/organization` is gone (ticket 11 deletes it); the
removal dialog stays at the route because it reads a query. `workspace/component/{identity,
members,transfer}.svelte` are unreachable until ticket 11 puts transfer in the workspaces
section, so export and import have no way in between this commit and that one; the effort
lands as one branch. The changeset is `minor`, matching the changeset that split settings
into the pages this reverses; it is the line that decides the effort's bump.

Raised, not taken: the palette no longer answers the word "settings" since rows are the
section names; `layout.workspaceMenu.settings`, the breadcrumb's `account` and `workspace`
cases and `common.nav.{organization,account}` are retired strings for ticket 12's sweep; the
first group of six sections carries no legend because the tab names it.
