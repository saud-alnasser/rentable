---

---

<!--
  Hypothesis and Falsifier were written on 2026-08-20 before any code, which is what
  [[templates/prototype.template]] requires and what stops a prototype confirming whatever was hoped for.
  Everything below them is filled in after the experiment ran.
-->

# Hypothesis

**A shell that is present in every state reads as one application waking up, rather than as a
broken one, provided each of its parts states what is true of the state it is in instead of
standing there disabled.**

The question is [[efforts/capabilities-only-one-surface-got/spec]]'s first open question, and it
is requirement 6 and requirement 7's shape. Requirement 7 already fixes one part by decision: the
account row is the way in when signed out. Everything around it is what this settles: what the
workspace row is when there is no workspace, what the four primary destinations do when nothing
can be navigated to, whether the titlebar keeps its search and its shortcut sheet before there is
anything to search, and whether there is a rail at all.

This will not settle on paper. The same question was settled the same way on 2026-08-20, when two
versions of the sign-in card carrying the application's mark were built and both were removed on
sight ([[efforts/the-shell-says-whose-workspace-this-is/spec]], requirement 10).

# Falsifier

**Any pre-ready state in which a continuous shell reads worse than the bare frame that ships
today.**

Today's behaviour is on the switcher as the first position rather than described from memory, so
the comparison is against the thing itself. Three concrete ways to see it fail, any one of which
is enough:

1. **The reader tries to use navigation that cannot work.** They click a destination in the rail
   while signed out and nothing happens. This is the risk the spec already names, and it is fatal
   to any variant that shows the four destinations.
2. **The pre-ready shell is louder than what it frames.** The sign-in card is the only thing on
   screen that can be acted on, and chrome around it takes the eye first.
3. **The transition into `ready` reads as a second application starting**, because so much of the
   shell changes at once that the continuity the whole requirement is for is not visible.

Where the falsifier fires for every variant, requirement 6 loses its shape and the answer is that
the shell stays gated, which the spec must then say in those words.

# Experiment

**Four pre-ready shells on the real application, selected from a floating bar, with a second bar
pinning the startup state.** Position one is what ships today, so the comparison is against the
thing itself rather than a memory of it.

**Where.** The working checkout, in `src/lib/prototype/`, untracked, which is what
[[rules/module-layout]] under *Prototype code* requires and why it requires it: being untracked
is what makes the files show in `git status` and stops them being committed silently. Two tracked
files are edited to mount it, and **those are the part that has to be reverted by hand rather
than deleted**: `layout/component/frame.svelte` delegates its not-navigation branch to the
variant dispatcher, and `routes/+layout.svelte` honours the pin and renders the bars. Both carry
a comment saying so.

*It was built in a detached worktree at `.aep/worktrees/shell-before-ready` first, sharing the
main checkout's 89 GB cargo target directory through `CARGO_TARGET_DIR`. The human moved it here
on 2026-08-20: a worktree is what [[skills/prototype]] asks for in general, and this repository
has already answered the question for itself, because Vite serves nothing from outside the
project's source tree and the rule that records that names `src/lib/prototype/` as the home.*

**The pin exists because none of these states can be reached on demand.** It forces `loading`,
`sign-in`, `recovery` or `error`, and supplies a stand-in `Recovery` so the recovery branch has
something to draw. `ready` is deliberately absent: the ready shell is not what is in question.
[[references/tauri]] records that with no control plane running the desktop application is a
sign-in screen that cannot be got past, so the state under test is also where the application
lands unaided.

**The four variants, disagreeing on whether there is a rail before the application is ready and
what is on it:**

| | The rail | The titlebar | Where signing in lives |
| --- | --- | --- | --- |
| **1 current** | absent | window controls only | the card |
| **2 full rail** | present, the four destinations drawn and inert, the workspace row the mark with nothing to name | search and shortcut sheet drawn and inert | the account row |
| **3 minimal rail** | present at icon width, the mark at the top and the way in at the bottom, no destinations at all | window controls only | the account row |
| **4 no rail** | absent until ready | carries the mark and a sign-in control | the titlebar |

Variant 2 is the bet that continuity means never changing shape. Variant 3 is the bet that it
means the rail existing rather than the rail being full. Variant 4 is the bet that a rail is
something a workspace has rather than something the application has, and it is the literal
reading of what was asked for: the shell shows the icon, and a login option.

**How it was run.**

```bash
pnpm dev:desktop
```

`pnpm check` passes clean on 9610 files with the prototype mounted, and was confirmed to
actually read `src/lib/prototype/` by planting a type error there and watching it fail.

# Observation

**No variant won, and the reason it did not is the finding.** The human ran all four against all
four pinned states on 2026-08-20 and split the answer by state rather than picking a shell:

- **Loading, failing to start, and update recovery read better bare.** Variant 1 wins all three.
  Chrome around a card in these states is chrome belonging to an application that is not running.
- **Signing in reads better with the full rail.** Variant 2 wins, with its account row changed:
  not the sign-in row it was built as, but **an empty user glyph opening a menu of two, the way
  in and settings**. The rail folds. Everything else on it is disabled.
- **The sign-in card does not move.** It stays centred in whatever the shell leaves it, exactly
  as it is today.

**Variants 3 and 4 lost outright.** The minimal rail is a rail that has given up saying anything,
and the titlebar-only shell puts the way in somewhere no other state has anything.

**Two things came out of the run that the experiment was not testing**, both raised by the human
looking at the result rather than by the variants:

- **Settings has to work signed out**, because an account menu offering settings while signed out
  is a menu with a broken row in it otherwise. Checked against the tree afterwards: the whole of
  `/settings` is host-only. `settings/router.ts` forwards to `ctx.host.settings`, updates go
  through `ctx.host.update`, and the diagnostics directory is a field on the host's `Settings`.
  Nothing on the page reads the workspace database. What stops it loading is `api/context.ts`
  making identity required, on the ground that "there is no request without a signed-in user".
  That ground is what this decision removes.
- **`layout.workspaceMenu.locked` reads *not available yet* and should read *not available*.** One
  line per locale, used by the real workspace menu.

# Result

**Refuted as stated, and the falsifier is what caught it.**

The hypothesis was that a shell present in **every** state reads as one application waking up.
Falsifier 2 fired in three of the four pre-ready states: in loading, failure and recovery the
chrome is louder than the card, which is the only thing on screen that can be acted on. Written
before the run, and it is what the run found.

Falsifier 1 did not fire, which is the part worth keeping: disabled destinations beside a sign-in
card did not read as a promise the application was breaking. That is why variant 2 survives in the
one state where it survives.

Falsifier 3 was not reached. It needs a real sign-in against a running control plane, and the
decision below makes it cheaper to check later: the rail is already on screen before the sign-in,
so what is being watched is the rail filling rather than a rail appearing.

**What survives is a narrower claim than the one that was tested**, and narrower is the honest
word: the shell is drawn once the application is working, and an application waiting for a person
is working.

# Conclusion

**The dividing line is not ready-versus-not-ready. It is whether the application is running.**

| State | What the application is | What is drawn |
| --- | --- | --- |
| loading | not known yet | bare frame |
| failed to start | not running | bare frame |
| update recovery | not running | bare frame |
| signing in | running, waiting for a person | the shell |
| ready | running, with a person | the shell |

That principle is what goes into the spec, rather than the table, because the table is derivable
from it and a later state added to the application has to be able to find its own answer.

**This reverses a decision taken two days earlier, and the reversal is recorded rather than
absorbed.** [[efforts/the-shell-says-whose-workspace-this-is/spec]], requirement 10, settled that
the sign-in card carries no mark and no product name, and it was settled by building two versions
that carried the mark and removing both on sight. **The mark is now beside that card again**, in
the rail rather than on the card. The card itself is untouched, so the requirement's words still
hold literally; what changed is what is around it. It was reached the same way that one was, by
looking, which is the only reason it stands.

**Requirement 7 gains a shape it did not have.** It said the account control is the way in when
signed out. It is now specifically an empty user glyph opening a two-item menu, the way in and
settings, which was in none of the four variants: it came out of looking at variant 2's sign-in
row and wanting less of it.

# Disposition of the code

**Landed 2026-08-20**, at the human's instruction. All three questions this scaffolding carried are
answered and built; the switcher is gone and `src/lib/prototype/` holds only `switcher.svelte`,
which is tracked infrastructure that predates this effort.

**The rail is one component, not two.** The prototype built `shell-signed-out.svelte` as a clone of
the rail, because a prototype must not disturb what ships. As implementation a clone would be the
wrong shape: requirement 7's claim is that **the shell does not change shape when somebody signs
in, its contents fill in**, and two rails that must look identical and live in two files will drift
until they do not. So `layout/component/sidebar.svelte` gained a `signedOut` prop, and
`frame.svelte`'s `showNavigation` boolean became `shell: 'bare' | 'signed-out' | 'full'` — one
place where requirement 6's line is stated.

- `account-signed-out.svelte` became `layout/component/account-signed-out.svelte`.
- The prototype's workspace row became `layout/component/workspace-locked.svelte`, a real component
  rather than markup inline in a clone: it holds the place `workspace-menu.svelte` holds.
- `shell-titlebar.svelte` was deleted rather than promoted. It existed because the variants each
  needed the drag region; the frame already had that snippet, which now serves all three states.
- **Deleted**: `shell.svelte.ts`, `shell-bars.svelte`, `shell-signed-out.svelte`,
  `shell-titlebar.svelte`, `account-signed-out.svelte`, and the pinned state and its stand-in
  `Recovery` in `routes/+layout.svelte`. The pin was the thing that most needed not to survive: it
  was a way to fake a startup failure inside the application.

**One change outside the shell.** `useFetchRemoteSyncState` gained an `enabled` argument. The rail
asks who is signed in through a procedure, a procedure needs an acting user, and the signed-out rail
asking would be a refusal by design arriving as a failure. The rail already knows the answer, so it
does not ask.

**Requirement 9a is now owed rather than optional.** The account row offers settings, and the whole
of `/settings` still refuses a request with no identity — `api/context.ts` throws before any
procedure runs. Nothing in the application reads `ctx.identity` yet, which makes the change smaller
than it looks, but it is a decision about who may call what and it is not this prototype's to make.
Until it lands, that row reaches a page that reports it could not load.

**Kept, because they are the effort's work rather than the prototype's**: `i18n/en/index.ts`,
`i18n/ar/index.ts` and the regenerated `i18n-types.ts`. The prototype was moved off hardcoded
English and onto `$LL` on 2026-08-20 at the human's instruction, so the strings it needed became
keys in both locales. Requirement 9b's copy change is in there too.

**What a prototype skipped and `/implement` still owes**: the tests. Nothing here is covered.
