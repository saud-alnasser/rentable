---
use-when: "about to create, edit or delete anything on disk, creating a worktree, or writing a brief for an agent that will"
---

# Rule — the project directory is the boundary

This rule tightens [[policies/execution]], which places a child in its own worktree but
says nothing about the rest of the workstation. It binds the orchestrator and every agent,
inside an effort or not.

## Nothing is created, edited or deleted outside the project directory

Every file or folder a run or an agent creates, edits or deletes by its own act sits inside
the repository's directory. **The one exception is the system temp folder** (`$TEMP`,
`/tmp`), for the small working files of the process itself: helper scripts, logs, backups.
The scratchpad the harness names, which sits there, is the first choice.

Outside those two there is nothing: not the root of a drive, the home directory, a sibling
of the repository. And the temp folder is not where a build or a worktree goes: anything
the size of a build belongs inside the project, where it is named and removed.

What a tool writes on its own as part of doing its job is not an act of the run — cargo's
registry, the pnpm store, a compiler's cache. Choosing where it writes is: a
`CARGO_TARGET_DIR`, an `--out-dir`, a `git worktree add` path all point inside the
project.

*Why: agents of efforts 851 and 854 made `C:/ct`, `C:/t`, `C:/w851`, `C:/t854-18` and
`C:/t02` to `C:/t07` at the drive root, one of them 15 GB: unnamed, unorganized clutter the
human found by chance and never asked for.*

## Where things go inside it

- **A worktree** goes under `.aep/worktrees/`, from the main checkout, whatever the work: a
  ticket's child, a one-off fix agent, a prototype.
- **Rust build output** goes in a short folder of its own beside the worktrees,
  `.aep/worktrees/<effort>/_t<NN>` for a ticket and `_target_run` for the run
  ([[references/cargo]]).

*Why: a one-off agent of effort 851 put its worktrees at `C:/w851/*`, and a worktree's own
`target` is too deep for Windows, which is what sent builds to the drive root.*

## Blocked inside it, stop and report

An agent that cannot do its work inside the boundary — a path over the Windows limit, a
full disk, a tool that insists on a location — **stops and reports what blocked it**. It
never picks a place of its own, however reasonable it looks.

*Why: ticket 18 of effort 854 hit the path limit and moved a 15 GB build to `C:/t854-18`
without saying so.*

## The brief names the places

A dispatch brief names the worktree, the build folder and the scratchpad by full path and
says nothing is written anywhere else. It never names a place outside them, including as a
workaround.

*Why: a child reads its brief before any rule, and an 851 brief that said `C:/t/r851-18` was
where the drive-root folders started.*

## What a run makes, it removes

A ticket's `_t<NN>` goes when its worktree is released, and the run's `_target_run` when the
run closes. A run's report names anything it left on disk and why.

*Why: build folders outlive the surfaces they served, and nobody else knows they are spent.*
