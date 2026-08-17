---
aep: 2.2.0
owner: repository
date: 2026-08-17
kind: reference
use-when: "working with issues, pull requests, or CI runs on GitHub"
---

# gh — GitHub CLI

Derived from: aep/github.md

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

**Creating an issue publishes.** It lands in a workspace other people read, so it is the human's call — the same standing rule as opening a pull request and as pushing, and for the same reason. Propose the set, get it approved, then create. `/design` has the procedure.

`--body-file -` reads the body from stdin, which is how multi-line markdown survives intact — `--body` on a shell line does not. `-` for stdin, a path for a file.

Titles follow Conventional Commits, same as commit subjects: `type(scope): summary`.

## Find work

```
gh issue list --state open --label "ready-for-agent" --json number,title,labels
gh issue view <number> --comments
```

`--json` takes an explicit field list — there is no "all fields". `gh issue list --json` with no value prints the available field names, which is the quickest way to find one. Pair with `--jq` to filter without a second process.

## Comment and label

```
gh issue comment <number> --body-file -
gh issue edit <number> --add-label "in-progress" --remove-label "ready-for-agent"
gh label list                                     # read before creating any
gh label create "<name>" --color <hex> --description "<text>"
```

`gh issue edit` adds and removes labels; it does not replace the set.

`gh label list` is the read that comes before `gh label create`, always — `/triage` has the reuse rule. `create` fails on a name that already exists rather than editing it, so the list is what tells you whether you are adding or colliding. `--color` takes a bare hex with no leading `#`.

## Pin and unpin an issue

The map lives as a pinned issue — [[rules/tracker]] has that rule; these are the invocations. Both take a number or a URL.

```
gh issue pin <number>
gh issue unpin <number>
```

GitHub caps pinned issues at three per repository. What `pin` does at the cap — refuse, or evict an existing pin — is **untested**, and neither the help text nor the docs say; do not rely on either behaviour. Where the cap could be in play, unpin first.

Docs: https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/pinning-an-issue-to-your-repository — the cap's source, and silent on the at-cap behaviour.

## Read and set Assignment

Assignment is which human owns delivering the issue. AEP reads it; it writes it only when asked (`/implement` has the rule).

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

`develop` creates the branch in the repository rather than locally, so it publishes — the same standing rule as pushing. It also names the branch by GitHub's convention rather than AEP's, and `--list` sees only branches created through it, so it is not the read that answers whether a ticket is claimed. That read is `git ls-remote` (see [git.md](git.md)).

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

## Open a pull request

```
gh pr create --title "<conventional title>" --body-file - --base main
```

AEP does not open PRs unasked — creating one publishes work, which is the human's call. Same standing rule as pushing (see [git.md](git.md)).

What the body covers is a convention, not an invocation: [[rules/version-control]] has it.

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
