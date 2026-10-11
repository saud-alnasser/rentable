---
use-when: "an effort's `## Needs you` holds a check the owner makes by looking at the interface, or an effort holding one is handed over"
---

# Rule: an on-screen check is handed over staged

This rule tightens what [[policies/execution]] leaves in `## Needs you`. A check the owner makes
by looking at the interface (how something reads, where it sits, what opens, what asks first) is
not handed over as a sentence to go and find in the running app. It is handed over as staged
states the owner steps through, already entered and looked at by the run. How staging works and
how a state is written is [[references/stage]].

## Every on-screen check is a state

Each such item gets a state that puts the interface exactly where the check needs it: the
records, who is looking, what the shell answers, and the steps a person would take. One item may
need several states (each form, each appearance of a toast); a state's `look` line says in one
sentence what to look at.

The states are written in a `_stage` worktree at the effort's tip,
`.aep/worktrees/<effort>/_stage`, as one untracked file, `state/<effort number>.ts` under
`apps/desktop/src/lib/prototype/stage/`. They never enter a commit: they are the check's
scaffolding, and the effort's tests already hold what is true.

## The run looks first

Before the owner sees anything, `pnpm stage:shots <effort number>.` enters every state in English
and Arabic, light and dark, and every shot passes. Each screenshot is looked at. A state that
does not reach its screen is fixed; a screen that shows a defect is a defect, fixed in the effort
like any other found one. What each state showed, in each language and appearance, is written in
`evidence/staging/needs-you.md`, and the `## Needs you` item points to its state.

## Then the owner gets the window and the list

The hand-off runs `pnpm stage:open` from the `_stage` worktree, which opens a window (opening it is
not driving the app: the owner steps through it), and gives the list: each state's number on the
bar, its label, and what to look at. The `_stage` worktree is removed once the owner has looked.

## Mock data only

Staging never reads or writes the owner's database, credentials, session or sync: there is no
Tauri process behind it, and a state reaches its screen through mock records, host answers and
on-screen steps, never through real data or a flag product code reads. A check staging cannot
show (what [[references/stage]] lists under *What it cannot show*) stays in `## Needs you` as a
check in the running app, saying why it is not staged.

## Not variant judging

[[skills/prototype/ui]] puts variants on the switcher for the human to pick between, on real
query data. Staging shows the one built interface in one state each; it is for checking what was
built, not for choosing what to build.

*Why: the owner asked that "after every effort the needs the owner section that has ui things to
lookout for you run the app from your worktree with a prototype switch and simple i see how
things will look like", and that it "doesn't affect real data meaning you will use mock data to
show me that will reflect how real data within this state will be shown in the app" (effort 861,
requirements 11 and 12).*
