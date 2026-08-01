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
graphite/fix/142-partial-update-uniqueness      → fix: partial update uniqueness (#142)
graphite/refactor/147-typed-error-enum          → refactor: introduce a typed error enum (#147)
graphite/feat/151-contract-termination          → feat: contract termination (#151)
```

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

**Conventional Commits**, and the ticket id goes in the subject as a trailing `(#N)`:

```
refactor: introduce a typed error enum (#147)
fix: partial updates crash on unguarded uniqueness checks (#142)
test: characterize dashboard aggregation (#139)
chore(deps): update all non-major dependencies (#80)
```

**The scope is optional here and mostly unused** — the log carries it for dependency and
tooling commits and omits it elsewhere. Do not invent one to fill the slot; where you do
use it, it names an engineering domain, and `misc`, `stuff`, and `update` are not domains.

Types in use: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
`test`.

## How work lands

By pull request, reviewed and merged on GitHub. **CI lints the pull request title** against
Conventional Commits — a non-conforming title fails the run, not the review — and runs the
full gate: typecheck and format, ESLint, the TypeScript tests, the Rust tests, and a
production Tauri build. All of it must pass.

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
