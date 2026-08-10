---
owner: repository
---

# gt — Graphite (stacked changes)

Derived from: aep/graphite.md

Docs: https://graphite.com/docs
Fetch the docs when: a subcommand or flag you need is not listed below.
Never guess a `gt` command. Graphite's verbs are its own — several read like git's and do something else.

`gt --help --all` lists every command; `gt <command> --help` gives its flags. Check one of those before reaching for a command not listed here.

## Know whether the repo uses Graphite

A repo is on Graphite only if `gt init` has been run **in it**. `gt` being on the machine says nothing.

```
ls .git/.graphite_repo_config      # exists → initialised here. absent → plain git
```

Read the filesystem, not `gt`. **This command initialises the repository as a side effect** — do not use it to probe:

```
gt log --stack          # NOT a probe: initialises the repo, then exits 0
```

Verified on gt 1.8.6 in a repo that had never seen `gt`. It printed `Graphite has not been initialized, attempting to setup now...`, set trunk to `main`, then failed with `ERROR: Cannot perform this operation on untracked branch <name>` — and wrote `.graphite_repo_config`, `.graphite_metadata.db`, `.graphite_pr_info`, and `.gtlocalprinfo` into `.git/`, **and exited 0** — so a probe keyed on a non-zero exit reads an uninitialised repo as initialised, having just made that true. Nothing lands in the tracked tree, so `git status` stays clean and the change is invisible where you would look for it.

On a repo that is not on Graphite, use [git.md](git.md) and don't offer to initialize one unasked.

## The model

A **stack** is a sequence of branches, each built on its parent, each becoming its own PR. **Trunk** is what the stack merges into (`main`). **Downstack** is the ancestors of the current branch, **upstack** its descendants.

The consequence that matters: **one branch is one commit's worth of reviewable change.** Where plain git would add a second commit to a branch, Graphite either amends the branch or stacks a new one on top — and either way every descendant needs rebasing, which `gt` does for you and `git commit` does not.

## Create a branch with the staged changes

```
gt create <name> -m "type(scope): summary"
```

`gt create` branches *and* commits in one step — it is not `git checkout -b`. It commits what is staged; `-a` stages everything tracked first, and carries the same objection as `git commit -a` (see [git.md](git.md)), so stage explicitly instead.

Stacking is implicit: the new branch sits on top of whatever is checked out. To stack on something else, check that out first or pass `-o, --onto <branch>`.

`--onto` is how a ticket is built on its blocker rather than on trunk. The branch name is still AEP's — `gt create <name>` takes it explicitly, so do not let `gt` generate one from the commit message.

## Adopt a branch git already created

```
gt track --parent <branch> --no-interactive
```

`gt create` both branches and commits, so it cannot claim a ticket before there is
anything to commit. `git switch -c <name>` followed by `gt track` does: the branch exists
immediately, and `--parent` puts it in the stack without moving anything under a dirty
tree. Verified on gt 1.8.6.

`--parent` must name an already-tracked branch, and passing it restricts the command to
one branch. Without it the command selects each parent interactively, so pass it in any
scripted run. `-f, --force` skips the prompting instead by reparenting onto the nearest
tracked ancestor, and **takes precedence over `--parent`** — never pass both.

## Rename a branch

```
gt rename <name> --no-interactive
```

Renames the branch and updates the `gt` metadata that referenced it, so the stack stays
intact. Called with no name it prompts, which is a hang in a scripted run. Verified on gt
1.8.6.

**Rename before submitting, never after.** A GitHub pull request's head branch name is
immutable, so `gt` drops the branch's association to its pull request rather than moving
it — the pull request is left behind, and the next submit opens a second one. `-f,
--force` only permits the rename when a pull request is already open; it does not preserve
the link.

The case that arises is a branch whose type turned out wrong — work claimed as
`graphite/refactor/…` that lands as `docs:`. The branch name is the conventional commit
the branch will land as (`.claude/policies/version-control.md`), so it is corrected as
soon as the type is known, which is always before the human submits.

## Amend the current branch

```
gt modify -m "type(scope): summary"     # amend the branch's commit
gt modify -c -m "type(scope): summary"  # add a new commit to this branch instead
```

This is the amend path on a Graphite repo, and the reason to prefer it over `git commit --amend`: **`gt modify` restacks every descendant automatically.** A bare `git commit --amend` in the middle of a stack leaves everything above it pointing at the old commit.

`gt modify` prompts to stage unstaged changes. In a non-interactive session that prompt is a hang — stage first, and pass `--no-interactive`.

`-c` is also how the **first** commit lands on a branch `gt track` adopted: on a branch with no commits `gt modify` creates one whether or not `-c` is passed, so there is no `gt create` step for a claim that was made before the work existed.

**There is no `-F`/`--file`.** `-m` takes a full multi-line message in one argument, so `-m "$(cat message.txt)"` is the way to commit a body with headings and tables intact — verified on gt 1.8.6. It is declared as an array and so accepts repetition too; what that does to the spacing between values was not checked, and a body written as one argument does not need it.

## Navigate the stack

```
gt log --stack          # the stack, graphically
gt up / gt down         # one branch upstack / downstack
gt top / gt bottom
gt checkout <branch>
gt info <branch>        # PR title, body, and status for one branch
```

## Repair the stack

```
gt restack              # rebase every branch in the stack onto its parent
gt continue             # after resolving conflicts mid-restack
gt abort                # give up on the in-progress operation
```

`gt restack` is the fix when branches have drifted — most often because a `git` operation edited history that `gt` didn't know about.

## Reparent a branch

```
gt move --onto <branch> --no-interactive        # move the current branch; descendants follow
gt move --onto <branch> --source <branch>       # move one other than the current
gt move --onto <branch> --only                  # leave descendants on the old parent
```

**`gt restack` is the wrong verb when the parent is gone.** It rebases onto the parent Graphite has *recorded*, so a branch whose parent branch was deleted has nothing to rebase onto. `--onto` is the only way to name a new one.

This repository squash-merges, which makes that case routine rather than exotic: the squash commit is not an ancestor of the branch it came from, so merging a parent's pull request deletes that branch and leaves every child pointing at a parent that no longer exists. GitHub retargets the child's pull request to the default branch on its own, the pull request goes `DIRTY`, and **auto-merge stays enabled on it and simply never fires** — there is no failure to notice. Fetch the default branch before moving onto it (`git fetch origin main:main`), or the move lands on a stale trunk.

Verified on gt 1.8.6. Two things worth knowing before typing it:

- **With no `--onto`, `gt move` opens an interactive selector** — a hang in a non-interactive session, not an error.
- **`--help` contradicts itself about `--interactive`**: the prose says "Enabled by default" and the annotation beside it says `[default: false]`. Pass `--no-interactive` explicitly rather than relying on either reading.

## Never submit or sync

```
gt submit               # pushes to GitHub and opens/updates PRs — do not run
gt sync                 # pulls trunk, rebases, and prompts to delete merged branches — do not run
```

`gt submit` publishes. It is a push plus PR creation, so it falls under the same standing rule as `git push`: **AEP does not publish** — that is the human's call.

`gt sync` is out for a second reason: it rewrites local history against the remote and interactively offers to delete branches. Both are destructive and both need a human at the keyboard.

### What submit cannot be handed

Verified against `gt submit --help` on gt 1.8.6, and against the command reference:

- **There is no `--title`, `--body`, `--body-file`, or stdin.** The metadata flags are prompts (`--edit`, `--edit-title`, `--edit-description`) and their negations, plus `--ai`. A pull request body cannot be pre-written and passed in.
- **It does not prefill the description from the commit message.** Observed on gt 1.8.6 submitting a five-branch stack: the pull request **title** was taken from the commit subject, and the **body** was this repository's `.github/pull_request_template.md`, unfilled. The commit body reached neither. `--help` and the command reference document none of this, so it is an observation on one version rather than a contract.
- **A non-interactive submit creates every pull request as a draft.** It says so on the way past — `Inline prompts to fill PR fields will be skipped and new PRs will be created in draft mode`. `-p, --publish` opts out; `gh pr ready <n>` undrafts afterwards, which is the better order when the body still has to be written.

So on this repository the commit body reaches the pull request **not at all**, and squash discards it on merge as well (`squash_merge_commit_message: BLANK`). A closing keyword written into the commit body therefore closes nothing by itself — the pull request body has to carry it, written after submit with `gh pr edit --body-file`. Keep it in the commit body regardless: it is what the reviewer reads on the branch, and it is the text to copy from.
