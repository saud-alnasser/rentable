---
status: open
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

- [ ] `settings/section.ts` exports the ordered section list, `sectionOf(url)` (unknown or
      absent reads as `general`), `sectionsFor(session, holdsTursoAuthority)` as the plan's
      *Interfaces* gives it, and `withSection(name)` typed as `create-intent.ts` types
      `withCreateIntent`; tested under `node:test`.
- [ ] `settings/component/area.svelte` is pure props (settings, session, `holdsTursoAuthority`,
      remote-sync state, members, the chosen section) and renders the title, the rail and the
      chosen section's blocks; `settings/component/rail.svelte` is a `nav` of anchors in
      `sidebarMenuButtonVariants`, the current one `aria-current`, read from
      `page.url.searchParams` and never from `isActiveRoute`.
- [ ] `area.svelte.test.ts` renders an owner session and finds the seven sections in order,
      and a plain member session and finds `general`, `you`, `workspaces`, `sync`, `updates`,
      `diagnostics` and no `members`; with no session, `general`, `updates`, `diagnostics`.
- [ ] `routes/settings/+page.svelte` owns the queries and renders the area; `routes/organization`,
      `routes/workspace` and `routes/account` do not exist; `OPENS_SIGNED_OUT` and
      `shell-surface.test.ts` are unchanged.
- [ ] `layout/destination.ts`'s `secondaryDestinations` are the sections through
      `withSection`, `Destination.url` admits them, and `palette.svelte` keys rows on the full
      string; `palette.test.ts` and `navigation.test.ts` pass.
- [ ] `workspace-menu.svelte` offers the switcher, a workspaces row to the workspaces section
      and the invite row; `account-menu.svelte` offers you, settings and sign out; both tests
      assert the rows and their hrefs.
- [ ] The section names exist in both locales under `settings.section.*`, written, not copied.
- [ ] `pnpm check`, `pnpm lint` and `pnpm test` pass; a changeset rides with the change.

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

Nothing yet.
