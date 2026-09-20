---
status: resolved
blocked-by: ['21']
---

# feat(settings): a member's role, permissions and workspaces are one sheet

## Outcome

Opening a member's card, or edit on its menu, opens one sheet of three sections: the role, a
chooser with a sentence per role; also allowed, for a member only, an additive list of the acts
they were widened by, each a sentence, grouped by people and workspaces, added from a chooser
and removed from the list; workspaces, one row per workspace with a named access level and
its sentence. What each role may do is a read-only table opened from the members tray. The
menu's change-role and workspaces entries leave. The roles, the acts, the widening rules and
who may change what are unchanged.

## Acceptance Criteria

Traces requirement 23 of
[[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], and its criteria 23
and 12.

- [x] `organization/component/member-sheet.svelte` is a `FormSurface` of `light` weight
      replacing `role-dialog.svelte` and `access-dialog.svelte`, opened by the members section
      from a card's address and its `edit` entry; its three sections are the role `Select` with
      a sentence per item (the owner's role never offered; the reader's own card and the
      owner's card open no sheet), the also-allowed list for a member (each held act a
      sentence with a remove control, under people and workspaces; one add control opening a
      chooser of the acts not held with the same sentences, an act that signs rows offered to
      the owner alone), and the workspaces rows with the two levels as a `Select` with a
      sentence each; save runs the change-role, widening and grant acts that exist in one
      handler, a refusal marking its section; the menu loses `change role` and `workspaces`
      and gains `edit`. `organization/component/role-table.svelte` is read-only, opened from
      the tray by a quiet control beside add, one row per act with its sentence and a column
      per role, the acts nobody can be given listed under the owner with the reason.
      *Verified 2026-09-16 on the effort branch: `member-sheet.svelte` is a light
      `FormSurface` of three sections opened from the card's address and its `edit` entry;
      `role-table.svelte` is read-only and opened from the tray; `role-dialog.svelte` and its
      test are gone; `access-dialog.svelte` stays because the workspaces section draws it for
      a workspace's members, its docstring saying so, and the sheet imports its types; the
      workspaces rows keep the three stored levels, each with a sentence, since dropping the
      third would remove taking a grant back.*
- [x] `member-sheet.svelte.test.ts` and `members.svelte.test.ts` find the three sections, a
      sentence per role and per act, the chooser adding an act, no also-allowed section for
      an administrator, the save calling the three acts with what was chosen and a refusal
      marking its section, the menu without the two entries and with edit, the owner's and the
      reader's own card opening nothing, and the tray's control opening the table.
      *Verified: `vitest run` over `member-sheet.svelte.test.ts` (17) and
      `members.svelte.test.ts` (35): `52 passed`, covering the three sections, a sentence per
      role and per act, the chooser adding and the remove taking back, the administrator's one
      line in place of also-allowed, one save handing back the role, the permissions and only
      the changed grants, a refusal marking its section, the menu with `edit` and without the
      two entries, the owner's and the reader's own card opening nothing, and the tray opening
      the table.*
- [x] The section was run against the human's organization from the run's worktree and the
      human looked at the sheet and the table before this ticket is resolved; what they said
      is under Notes.
      *Verified 2026-09-16 over three looks at the dev build from the run's worktree against
      the human's organization: the first look asked for the edge panel instead of the dialog
      and the directory's shape inside it ("member edit form from dialog to sheet; also
      redesign the form still feels odd; what i'm looking for is the same design at top
      controls then records below directory"); the second found the also-allowed list off on
      all four readings offered (too much for a short list; adding one at a time fiddly; reads
      like a second permissions form; the words unclear), and it became "beyond their role", a
      plain list of sentences with an x each, one picker ticking several acts, and act
      sentences of the shape "can invite members"; the third: "Looks right, resolve 23".*
- [x] Every sentence in both locales, the Arabic written, under keys that keep one term to
      one key; `pnpm check`, `pnpm lint` and `pnpm test` pass; the changeset of ticket 03 is
      extended with one paragraph.
      *Verified in the run's worktree: every sentence in both locales, the Arabic sweep
      passing; five keys retired and two renamed to say member; types regenerated with no
      drift; `pnpm check` exit 0 (desktop `9312 FILES 0 ERRORS 0 WARNINGS`), `pnpm lint` exit
      0, `pnpm test` exit 0 (desktop `223 passed`); `cargo fmt --check` clean; the changeset
      carries the sheet's paragraph.*

## Relevant areas

`apps/desktop/src/lib/organization/component/{member-sheet,role-table,members,role-dialog,access-dialog}.svelte`,
`apps/desktop/src/lib/organization/tests/`, `apps/desktop/src/lib/settings/component/area.svelte`,
`apps/desktop/src/routes/settings/+page.svelte`, `apps/desktop/src/lib/organization/query.ts`,
`packages/workspace-permission/index.ts` (read, for the acts and the bundles),
`apps/desktop/src/lib/i18n/{en,ar}/index.ts`.

## Constraints

- **Read [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/plan]], *A member's
  sheet*, and the research file it cites.**
- **No act, role, level or rule changes** (826, requirement 6): the sheet calls what exists.
- **[[rules/interface]], *Form surface* and *Validation errors***: one surface of declared
  weight; a refusal marks its section.
- **Plain words, short lines**; the look is judged on real accounts, and the human is at the
  machine, so ask before driving the application.

## Notes

- *2026-09-16, at integration, three looks.* After the first the sheet took the form surface's
  heavy weight (the edge panel) and, inside, one tray with the role and two lists as rows; the
  save stays in the surface's footer, which the interface rule fixes as the actions' band, and
  the tray is the directory tray's shape rather than the block, since the block lacks a class
  and a legend variant for a panel (raised, not taken). After the second the acts list became
  "beyond their role": a plain list, one line per act with an x, "nothing beyond their role."
  when empty, one picker of the acts not held with checkboxes and one confirm, the signing acts
  absent for a non-owner, and the seven act sentences reworded to "can invite members" and the
  like in both locales, which the role table reads too. `access-dialog.svelte` stays for the
  workspaces section's own use; the workspaces rows keep the three stored levels.
