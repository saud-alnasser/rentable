---
use-when: "working with issues, pull requests, or CI runs on GitHub"
---

# gh — GitHub CLI

**This file is yours.** It records how `gh` is actually operated on
`saud-alnasser/rentable`; correct it where the repository differs rather than
deferring to what a seed said.

Commands below were checked against `gh` 2.96.0. Where a version here is older,
the gaps are the parts to re-check first.

Docs: https://cli.github.com/manual/
Fetch the docs when: a subcommand or flag you need is not listed below.
Never guess a flag. An unlisted flag is a docs fetch, not an assumption.

`gh <command> --help` is the fastest check and is always current for the installed version — prefer it over recalling a flag.

## Check availability and auth

```
gh auth status          # non-zero → the tracker is not usable; say so rather than working around it
```

Run this before the first tracker operation of a session, not after a failure.

## Create an issue

```
gh issue create --title "<conventional title>" --body-file -
```

**Creating an issue publishes.** It lands in a workspace other people read, so it is the human's call — the same standing rule as opening a pull request and as pushing, and for the same reason — [[policies/engineering]] carries it. Propose the whole set, show the exact titles rather than a summary, get it approved, then create. [[policies/execution]] has that procedure and applies it to labels and milestones too.

`--body-file -` reads the body from stdin, which is how multi-line markdown survives intact — `--body` on a shell line does not. `-` for stdin, a path for a file.

Titles follow Conventional Commits, same as commit subjects: `type(scope): summary`.

## Find work

```
gh issue list --state open --label "🎯 status: ready" --json number,title,labels
gh issue view <number> --comments
```

**The labels are this repository's, not AEP's canonical names.** [[rules/tracker]]
maps one to the other, and governs which to apply; `ready-for-agent` and the like
are not labels here and match nothing — the filter returns `[]` rather than
failing.

**For an effort's work, this is the wrong read** — labels do not carry effort
membership here. See *What carries an effort here* below.

`--json` takes an explicit field list — there is no "all fields". `gh issue list --json` with no value prints the available field names, which is the quickest way to find one. Pair with `--jq` to filter without a second process.

## Comment and label

```
gh issue comment <number> --body-file -
gh issue edit <number> --add-label "🎯 status: ready" --remove-label "📝 flag: triage"
gh label list --limit 100                         # read before creating any; the default is 30
gh label create "<name>" --color <hex> --description "<text>"
```

`gh issue edit` adds and removes labels; it does not replace the set.

**Which labels to apply, and whether to create one at all, is [[rules/tracker]]'s** — the example above is a real transition between two labels that exist.

`gh label list` is the read that comes before `gh label create`, always — [[policies/execution]] has the reuse ladder. **Pass `--limit`**: the default is 30 and this repository's vocabulary is longer, so a bare call answers with a truncated list that reads as the whole one. `create` fails on a name that already exists rather than editing it, so the list is what tells you whether you are adding or colliding. `--color` takes a bare hex with no leading `#`.

## Pin and unpin an issue

The map lives as a pinned issue — [[rules/tracker]] has that rule; these are the invocations. Both take a number or a URL.

```
gh issue pin <number>
gh issue unpin <number>
```

GitHub caps pinned issues at three per repository. What `pin` does at the cap — refuse, or evict an existing pin — is **untested**, and neither the help text nor the docs say; do not rely on either behaviour. Where the cap could be in play, unpin first.

Docs: https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/pinning-an-issue-to-your-repository — the cap's source, and silent on the at-cap behaviour.

## Read and set Assignment

Assignment is which human owns delivering the issue. AEP reads it; it writes it only when asked ([[skills/implement]] has the rule).

```
gh issue view <number> --json assignees,state,labels
gh issue edit <number> --add-assignee "@me"       # only when the user asks for it
gh issue edit <number> --remove-assignee <login>
```

`@me` resolves to the authenticated user. `--add-assignee` and `--remove-assignee` adjust the set; neither replaces it.

**`gh issue develop` is not the claim.**

```
gh issue develop <number> --name <branch>         # creates the branch ON THE REMOTE — do not run
gh issue develop <number> --list                  # read-only: branches linked this way
```

`develop` creates the branch in the repository rather than locally, so it publishes — the same standing rule as pushing. It also names the branch by GitHub's convention rather than AEP's, and `--list` sees only branches created through it, so it is not the read that answers whether a ticket is claimed. That read is `git ls-remote` (see [[references/git]]).

## Link a parent and its sub-issues

**`gh` has native flags for this as of 2.96.0**, and they take issue **numbers**, which is what makes them worth preferring over the API path below — the number is what you already have:

```
gh issue create --parent <number> …               # create a child under a parent
gh issue edit <number> --parent <parent>          # reparent an existing issue
gh issue edit <number> --remove-parent
gh issue edit <parent> --add-sub-issue <child>    # attach from the parent's side
gh issue edit <parent> --remove-sub-issue <child>
```

Read from `gh issue create --help` and `gh issue edit --help` on gh 2.96.0. Check the help before relying on them on an older install: this reference previously stated no such subcommand existed, which was true of the version it was written against.

**Gating is a second relationship and it has its own flags**, on `gh issue edit` alone. They take
numbers or URLs, and a comma-separated list where more than one applies:

```
gh issue edit <number> --add-blocked-by <blocker>     # this issue waits on that one
gh issue edit <number> --add-blocking <blocked>       # the same edge, written from the other end
gh issue edit <number> --remove-blocked-by <blocker>
gh issue edit <number> --remove-blocking <blocked>
```

Read from `gh issue edit --help` on gh 2.96.0 and used to build #768's edge onto #765. This is what
writes the `blockedBy` the frontier query below reads; there was no invocation here for it until
2026-08-23, and the query had been documented for four months without one.

The REST path still works and is the fallback where the flags are absent: parent/child goes through the sub-issues API with `gh api`:

```
gh api repos/{owner}/{repo}/issues/<parent>/sub_issues \
  -F sub_issue_id=<id>                            # attach a child to the parent
gh api repos/{owner}/{repo}/issues/<parent>/sub_issues
                                                  # list the children
```

Two traps, either of which fails against the wrong target or not at all:

- **`sub_issue_id` is the issue's `id`, not its number** — passing `#42`'s number succeeds against some other issue entirely. Read the id first:

  ```
  gh api repos/{owner}/{repo}/issues/<number> --jq .id
  ```

- **`-F`, never `-f`.** The API types `sub_issue_id` as an integer, and `-f` sends every value as a string; `-F` is the typed form that sends a number as one.

**Reading the children back needs `--paginate`, and the failure is silent.** The endpoint pages at 30, so a parent with more children answers with the first 30 and no indication there are more — a set created past that boundary reads as though half of it failed to attach. The issue payload carries no `parent` field either, so checking from the child's side finds nothing whether or not it is attached; the parent's list is the only read that answers.

```
gh api repos/{owner}/{repo}/issues/<parent>/sub_issues --paginate --jq '.[].number'
```

Attaching an already-attached child fails with `Issue may not contain duplicate sub-issues`, which is the confirmation that it was attached — not an error to route around.

Removing a child is its own invocation, needed the moment a ticket turns out not to belong under its parent. **The removal path is singular** — `sub_issue`, not `sub_issues` — and both traps above apply to it unchanged:

```
gh api --method DELETE repos/{owner}/{repo}/issues/<parent>/sub_issue \
  -F sub_issue_id=<id>                            # detach a child from the parent
```

Docs: https://docs.github.com/en/rest/issues/sub-issues. Fetch them before anything beyond the calls above; the payload shape is not stable knowledge.

Where the API is unavailable or refused, a **task list in the parent body** (`- [ ] #42`) is the fallback GitHub renders as a real relationship.

## Record a blocking relationship

Blocking is not the same edge as parent/child — see the entry above for that one.

**`gh` has native flags for this as of 2.96.0**, and they take issue numbers:

```
gh issue create --blocked-by <numbers> --blocking <numbers>
gh issue edit <number> --add-blocked-by <blocker>
gh issue edit <number> --remove-blocked-by <blocker>
gh issue edit <number> --add-blocking <blocked>
gh issue edit <number> --remove-blocking <blocked>
```

Read from `gh issue create --help` and `gh issue edit --help` on gh 2.96.0. This reference previously stated no blocking subcommand existed, which was true of the version it was written against — check the help before relying on these on an older install.

**State the edge in the issue body as well.** "Blocked by #12, #14." The native relationship is structured and queryable; the body line is what a human reads without opening the sidebar, and it is what the local-file tracker does anyway. Neither replaces the other.

## What carries an effort here, and the query that finds its open work

Resolved once against this tracker, per [[policies/execution]]. **Every fact
lands on a native feature, so no label is created for any of them.**

| Fact | Carrier | Read it with |
| --- | --- | --- |
| which effort a task belongs to | the sub-issue edge — the effort is the parent issue | `parent` in `--json` |
| what gates a task | issue dependencies | `blockedBy` / `blocking` in `--json` |
| open or resolved | the issue's own state | `state` |
| obsolete | the close reason `not planned` | `stateReason`, which **reads back `NOT_PLANNED`** |

**Milestones are not the carrier.** This repository has none, and the hierarchy
already answers the question — a milestone beside it would be a second copy of
the same fact. **No label carries it either**, and none is to be created for it;
the vocabulary and what governs it are [[rules/tracker]]'s.

The frontier — the effort's open tasks that nothing open is waiting on:

```sh
gh issue list --state open --limit 200 --json number,title,blockedBy,parent \
  --jq '[.[] | select(.parent.number == <effort-number>)
             | select([.blockedBy.nodes[] | select(.state == "OPEN")] | length == 0)
             | {number, title}]'
```

The frontier is **computed from declared edges, never guessed** from which files
a task looks like it touches — [[policies/execution]] requires exactly that.

**`blockedBy`, `blocking`, and `subIssues` are connections, not arrays.** On gh
2.96.0 each comes back as `{nodes: [...], totalCount: n}`, so the iteration is
`.blockedBy.nodes[]`. **`parent` is the exception** — a plain object, read as
`.parent.number`. Check the shape against the installed version before copying a
query from elsewhere.

**The wrong form fails quietly first.** Bare `.blockedBy[]` does not error: jq
iterates the object's values and emits the nodes array, then `totalCount`. The
*expected an object but got: array* message only appears once something
downstream accesses a field — `.blockedBy[].number`, or `.blockedBy[] |
select(.state == "OPEN")`. So the loud failure is the second-best case; the
first is a query that returns a plausible answer built from the wrong values.

**Filter on `state` inside `nodes`, not on the count.** `totalCount` counts
closed blockers too, so a task whose only blocker merged last week reads as
blocked and never joins the frontier.

**An open blocker that already has a branch does not block.** [[rules/version-control]]
makes `blocked-by` mean *stack on top of 01*, not *wait until 01 is resolved* — so a
ticket whose blockers are all built is buildable now, stacked on them. The query above
cannot see that: it filters on issue state, and an issue stays open until its pull
request merges. On a stack of a dozen unmerged branches it therefore answers **almost
nothing is ready**, which is the opposite of true.

So the query gives a *conservative* frontier, and the buildable one is that answer plus
every ticket whose open blockers all have branches:

```sh
git branch --format='%(refname:short)'   # a branch carrying a ticket id is that ticket, claimed and built
```

*Why this is not a defect in the query: state is the right filter for "is this work
done", and it is what closes an effort. It is the wrong filter for "may I start", which
on a stacked repository is a question about branches. Read both.*

**Raise `--limit` deliberately.** There is no server-side parent filter, so
`--jq` narrows a page `gh` has already truncated at 30 — and a truncated page
filters to a short list that reads as a complete answer, with the dropped tasks
looking like *not in this effort* rather than *not fetched*. This repository
carries roughly fifteen open issues, so one page covers it today; `--limit 200`
is what keeps that true as it grows.

The parent's own view is the cheaper read when the edges are not needed:

```sh
gh issue view <effort-number> --json subIssues,subIssuesSummary \
  --jq '.subIssuesSummary, (.subIssues.nodes[] | "\(.number) \(.state) \(.title)")'
```

`subIssuesSummary` is the progress read — `{completed, total, percentCompleted}`
— and **a parent can be closed while it is short of `total`**, which is how an
effort comes to assert it is delivered while live work sits under it. That is why
the summary is projected alongside the children rather than fetched and dropped:
the comparison is the point of the read.

## The observation `reconcile.mjs` reads

`.aep/scripts/reconcile.mjs` computes which efforts have tracker objects
disagreeing with their `spec.md`, and it fetches nothing itself. That is
deliberate: it is the slow owner of the terminal label, and the merge-time job in
`.github/workflows/labeler.yml` is the fast one. A forge call inside the script
would make the fallback carry the exact cost it exists to avoid.

Two lists, and the exact fields the script reads:

```
gh issue list --state all --limit 200 --json number,state,labels
gh pr list --state all --limit 200 --json number,state,labels,closingIssuesReferences
```

`closingIssuesReferences` is what ties a pull request to its effort, and it is
populated by the closing keyword. A pull request that carries none is reported
against no effort, which is the same omission the keyword exists to remove.

They are combined into one object with an `issues` key and a `changeRequests`
key, each holding that command's output unmodified. Nothing beyond `gh` is
needed to do it:

```
{ printf '{"issues":'
  gh issue list --state all --limit 200 --json number,state,labels
  printf ',"changeRequests":'
  gh pr list --state all --limit 200 --json number,state,labels,closingIssuesReferences
  printf '}'
} | node .aep/scripts/reconcile.mjs --observed -
```

It prints one line per finding and exits 1 where anything disagrees. Drift is a
label to correct, never a spec to edit, including where a person moved the label
by hand.


## Open a pull request

```
gh pr create --title "<conventional title>" --body-file - --base main
```

AEP does not open PRs unasked — creating one publishes work, which is the human's call. Same standing rule as pushing (see [[references/git]]).

What the body covers is a convention, not an invocation: [[rules/version-control]] has it.

## Read a pull request's checks

```
gh pr checks <number>
```

`integration` memoizes on the tree, so a green is not by itself proof it ran. The workflow fingerprints `git rev-parse HEAD^{tree}` and looks for a cache entry keyed on it; a hit skips every step below and reports green in seconds. **The duration is the tell** — the full job is minutes, and a pass in single-digit seconds is a memo hit.

A hit is sound, because the key is the tree hash and identical bytes already cleared this gate. But it is sound about a *different run*, and that is the run whose steps are worth reading when a suite has an intermittent failure in it.

```
gh run list --branch <branch> --workflow integration.yml --limit 5 --json databaseId,status,conclusion,createdAt
gh run view --job=<job-id>
```

The second prints the step list, which is the thing to judge a run by.

**A run whose conclusion is `cancelled` may still have proved the tree.** Seen on 2026-08-22, PR #748: every real step succeeded through `record the pass`, and the cancellation landed on a `Post` step afterwards, when a newer run for the same pull request superseded it. `gh run list` reads `cancelled`; the pass it recorded is real, and the later runs that hit the memo were entitled to it. Never conclude from a run's conclusion alone that a tree went unproved.

Merging one branch of a stack retargets its children and re-triggers their checks, so a single branch can show several runs minutes apart with the earlier ones cancelled by concurrency. `gh run view <run-id>` prints that cancellation as an annotation.

## Close an issue by merging

The issue closes when the pull request merges, and nothing before that asserts it did. These are message text, not invocations — there is no `gh` command that does this.

| Where | Form | Effect |
| --- | --- | --- |
| the commit message | `Refs #42` | links, closes nothing |
| the pull request body | `Closes #42` | closes on merge |

`close`/`closes`/`closed`, `fix`/`fixes`/`fixed`, and `resolve`/`resolves`/`resolved` all close; `Refs` is not among them, which is why it is the safe form for a commit.

Two constraints, both easy to get wrong:

- **The keyword only fires against the repository's default branch.** In a PR body targeting any other branch it is ignored entirely — no link, no closure on merge.
- **A closing keyword in a *commit* message still closes the issue** once that commit reaches the default branch, and it does so without listing the PR as linked. That is why the commit carries `Refs` — a cherry-pick or a rebase onto the default branch would otherwise close an issue nobody merged.

Docs: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue

## Close an issue as not planned

```
gh issue close <number> --reason "not planned" --comment "<one-line reason>"
```

`--reason` takes `completed`, `not planned`, or `duplicate` — the flag's full set, per `gh issue close --help`. `--comment` posts the closing comment in the same invocation, so the closure and its reason land together rather than as two calls with a failure window between them. Which lifecycle state takes this form, and what the comment must carry, is [[rules/tracker]]'s.

## Reopen an issue closed by mistake

```
gh issue reopen <number> --comment "<why it is open again>"
```

`-c`/`--comment` is the only flag it takes, per `gh issue reopen --help` on gh 2.96.0. Take the comment: a map or a ticket that goes from closed to open with no explanation reads as somebody changing their mind rather than as a correction.

**The mistake this exists for is a closing keyword in a pull request body.** `Closes #42` in a docs pull request closes #42 on merge exactly as hard as a delivering one does — see the table above — and an effort map closed that way looks delivered while nothing was built. It is worse than cosmetic where other issues declare `blocked-by` it: **a closed blocker reads as a satisfied one**, so every ticket waiting on it silently joins the frontier. Reopening restores the edge; nothing else has to be re-recorded.
