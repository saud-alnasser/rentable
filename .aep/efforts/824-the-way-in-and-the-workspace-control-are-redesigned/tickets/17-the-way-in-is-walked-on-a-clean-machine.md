---
status: open
blocked-by: [12, 13, 14, 15, 16]
---

# refactor(organization): the way in is walked on a clean machine

## Outcome

Every string the second half of the effort added reads as written in both locales, nothing in the
tree names an email, a display name, a join or a restore where the spec retired them, and the
whole way in has been walked by hand on the human's machine after it forgot the old shape.

## Acceptance Criteria

Traces requirement 16, requirement 17, requirement 18, requirement 19 and requirement 20 of [[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], and its criterion 16, criterion 17, criterion 18, criterion 19 and criterion 20 (the by-hand halves).

- [x] A read of both locales for every string tickets 09 to 16 added, recorded under Notes with
      anything corrected; `grep` over `apps/desktop/src` and `apps/desktop/tauri/src` for
      `displayName`, `display_name`, `email`, `onJoin`, `onRestore` finds nothing but the retired
      sentences that say so. *Verified 2026-09-13 on the effort branch: both locales' diffs since `9a08c8e2` read string by string under Notes; `grep` over both trees for `displayName`, `display_name`, `email`, `onJoin`, `onRestore` finds only the assertions that they are absent, the old-schema fixtures in `forget.rs` and `sync/store.rs`, and the OAuth scope; two stale comments corrected (`routes/account/+page.svelte`, `workspace/component/sync.svelte`).*
- [ ] On the human's machine: the first launch forgets the two organizations and opens on the
      first screen; the walk creates an organization with a username and ends in the workspace;
      an account is made and its three facts copied; disconnect asks once and returns to the
      first screen; connect by the link reaches the wall; the username and handed password sign
      in and force the change. Recorded under Notes with times.
- [ ] `pnpm check`, `pnpm lint`, `pnpm test` and `cargo test` pass.

## Relevant areas

Everything tickets 09 to 16 touched.

## Constraints

- **The by-hand walk is the human's to see**; the run drives the app and shows the captures.

## Notes

**The locales, read on 2026-09-13.** Every string tickets 09 to 16 added or reworded was read in
both languages: the wall's username label and disconnect confirm; the walk's name step
description and username label; the connect screen's title, description, label, wait and
unreadable sentences; pending accounts and its empty state; the invite description, the
cannot-send sentence and the two username copy strings; rename, its description, its refusal and
its toast; the link section's sentence; the page's disconnect sentence, button and toast. The
Arabic is written around its own verbs (الربط, افصل, غيّر الاسم) and none of it is a word-for-word
copy; nothing was corrected. The English `disconnectDescription` says the Turso account is
forgotten with the copies, which is what clearing the authority from the keyring is.

**Walked so far, 2026-09-13, on the human's machine from the run worktree.** The first launch
forgot the two organizations and opened on the first screen (criterion 17's by-hand half, seen).
The first screen was redrawn three times on the human's word (`2d76aca1`); the connect step
opened as granted and its disconnect became a glyphed control (`c530cc66`); the walk's words were
made plain (`c87fe7f7`). The name step created the organization; the third step then refused
with "no account is signed in on this machine", fixed in `4be12eb6` (the router's held context
was built before the owner existed); the workspace name was written into the dialog's store
rather than the walk's, and a reload sent the walk back to connect, both fixed in `c7176e9e`
(named forms, the walk resumes on the third step, create refuses while held). The first
workspace was then created and the members list reached. The account, disconnect, connect by
link and handed-password sign-in were not walked: the human closed the effort here on
2026-09-13 to rethink the whole experience of Turso, organizations, workspaces and members. The
by-hand criterion stays open.

