# Version control

## Which model

**Stacked changes, on Graphite.** `gt` replaces `git commit` here: `gt create` branches and
commits in one step, and `gt modify` is the amend path — it restacks descendants, which
`git commit --amend` does not. Read `.claude/tools/graphite.md` before any of it, and never
guess a `gt` verb; several read like git's and do something else.

Because the model is stacked, **`Blocked by: 01` in a ticket means _stack on top of 01_**,
not _wait until 01 is resolved_. Waiting is the thing the tool exists to remove.

**`main` is trunk**, and work never lands as a commit on it directly. What a single branch
may hold is the next section, and it is the rule most often broken by accident.

**Confirm this statement before relying on it.** It is one read:

```
ls .git/.graphite_repo_config     # exists → stacked changes. absent → plain git
```

Where the read disagrees with the statement above, **the read is right** — correct this
file where you are standing, and carry on with the true answer. Confirm it by reading the
filesystem, never by asking `gt`: several of its commands initialise the repository as a
side effect, so a probe that shells out to one can make its own answer true.

## One ticket, one branch, one commit

The stacked model collapses three things that are separate on plain git. **One ticket
becomes one `gt create`, which produces one branch carrying exactly one commit**, which
becomes one pull request.

That is not a style preference — it is what makes the stack reviewable. A branch holding
two commits is two changes a reviewer cannot take separately, and a ticket spread over two
branches is a ticket that cannot be claimed, because the claim is the branch.

The practical consequences, in order of how often they catch people:

- **A follow-up change amends; it does not stack a fixup.** `gt modify` is the path, and it
  restacks every descendant — which `git commit --amend` does not.
- **Work that turns out to be two tickets becomes two branches**, the second stacked on the
  first with `gt create --onto`. Do not grow the first branch to cover both.
- **A ticket too large for one commit was scoped too large.** Split the ticket first; the
  branch follows the ticket, never the other way round.

## Branch naming

Branches are cut from `main`, and **the name is the conventional commit the branch will land
as**, under the `graphite/` prefix:

```
graphite/<type>/<ticket-id>-<slug>
```

```
issue #135 → graphite/fix/135-partial-update-uniqueness
             → PR #142 → fix: partial updates crash on unguarded uniqueness checks (#142)
issue #111 → graphite/refactor/111-typed-error-enum
             → PR #147 → refactor: introduce a typed error enum (#147)
```

**The number in the branch and the number on `main` are different numbers**, and both
examples above are real. The branch carries the **ticket**; the trailing `(#N)` on the
landed subject is the **pull request**, appended by GitHub — see **Commit discipline**.
Never derive one from the other.

`<type>` is the conventional-commit type the branch lands as, from the list under **Commit
discipline** below. `<ticket-id>` is the bare issue number, no `#`. `<slug>` is the commit
summary in kebab-case, trimmed to the words that identify the change — it is a handle, not
the subject line, so it does not have to reproduce it exactly.

**The ticket id is what makes the name reproducible from the ticket alone**, and that is the
one property the convention has to have: the branch is how a ticket is claimed, so two
tools that derive different names disagree about whether the ticket is taken. `/implement`
derives the name and claims without asking.

Earlier branches carry no id — `graphite/refactor/contract-domain`,
`graphite/chore/ai-engineering-protocol`. They predate this convention and are left alone;
match the shape above for new work rather than the history.

A branch with no ticket behind it drops the id: `graphite/<type>/<slug>`. That is the
exception, not a second convention — if there is no ticket, there is nothing to claim.

## Commit discipline

**Conventional Commits**, and **nothing is appended to the subject by hand.**

The trailing `(#N)` throughout `git log main` is the **pull request** number, written by
GitHub when it squashes — not a ticket id, and not something a commit carries before it
lands. Confirm rather than trusting this paragraph; it is one call:

```
gh api repos/{owner}/{repo} --jq '{squash_merge_commit_title, squash_merge_commit_message}'
                      # PR_TITLE → GitHub composes the landed subject and appends (#PR)
```

So a commit written here reads without a number, and acquires one on merge:

```
written    refactor: introduce a typed error enum
lands as   refactor: introduce a typed error enum (#147)
```

Writing `(#N)` by hand produces a subject with two numbers in it, and the one that reads
like the ticket is the one GitHub did not add.

**The scope is optional here and mostly unused** — the log carries it for dependency and
tooling commits and omits it elsewhere. Do not invent one to fill the slot; where you do
use it, it names an engineering domain, and `misc`, `stuff`, and `update` are not domains.

Types in use: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
`test`.

## How work lands

By pull request, reviewed and merged on GitHub. **CI lints the pull request title** against
Conventional Commits — a non-conforming title fails a run, not the review — in a workflow
of its own, so editing a title re-runs the check and nothing else.

The gate is a single required status check named `integration`: typecheck and format,
ESLint, the TypeScript tests, the Rust tests, the frontend build, and a release-profile
compile of the Rust binary. All of it must pass. **It is the only required check** — the
title lint reports separately and, until it is added to the default-branch ruleset, a
failing title does not block the merge.

**Packaging is not proved before merge.** The gate compiles the binary and stops; bundling
the installers and signing the updater artifacts happen on `main`. A fault confined to
packaging therefore surfaces on trunk rather than on the branch that caused it, and the
release workflow is what catches it.

**Squash is the only merge method enabled**, and it discards the commit body
(`squash_merge_commit_message: BLANK`). Two consequences worth knowing before writing
either text:

- **The pull request title becomes the subject on `main`**, which is why CI lints it and
  why it — not the commit subject — is the Conventional Commit that has to be right.
- **Nothing in the commit body reaches `main`.** The body is still worth writing: it is
  what the reviewer reads on the branch, and on a stacked repository it is the only text
  AEP controls that can reach the pull request at all. But a closing keyword only closes
  its issue by way of the pull request body, never by riding the commit onto trunk.

Use the repository's template (`.github/pull_request_template.md`): it asks for the closed
issue, the changes, and a tests checkbox — fill all three rather than replacing the
template with prose. The default description otherwise covers **problem, solution,
architectural impact, testing, related issues, breaking changes** — never a
commit-by-commit account, which on a one-commit branch is the subject line again.

**A user-visible change needs a changeset.** Releases are driven from them on `main` —
versioning, tagging, and the signed updater artifacts are automated, so a missing changeset
means the change ships without appearing in the changelog. Dependency bumps and internal
refactors that no user can observe do not need one.

`gt submit` and `gt sync` publish and rewrite history respectively. Both are the human's
call, like `git push` — `.claude/rules/engineering.md` carries that as a standing rule.
