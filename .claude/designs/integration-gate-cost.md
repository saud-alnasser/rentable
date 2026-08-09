---
status: implemented
sources:
  - .github/workflows/integration.yml
  - .github/workflows/release.yml
  - tauri/tauri.conf.json
---

# ci: cut the cost of the pull-request gate

## Problem

A documentation-only pull request takes about thirteen minutes to go green, and
frequently takes that twice.

Measured on a single run of the integration job against a change that touched
only markdown: twelve minutes thirty-seven seconds, of which eight minutes
twenty-eight was Rust — two minutes twenty-four compiling the crate in the debug
profile for the tests, then six minutes four compiling it again in the release
profile to produce installer bundles that are never uploaded and never read. A
further one minute fifty-five was ESLint. The work that could distinguish that
pull request from any other took under thirty seconds.

Three separate faults produce the rest.

**The dependency cache has never once been used.** The integration job restores
its cargo cache in one second — a cache holding one and a half gigabytes of build
output does not restore in one second, so every run compiles from cold. The cause
is that the job's restore keys look for a cache scoped to the default branch, and
nothing has ever written one: the integration workflow runs on pull requests only,
so no run has ever executed on the default branch at all. GitHub scopes a cache
created during a pull request to that pull request alone and documents that runs
"cannot restore caches created for child branches or sibling branches", so each
pull request writes a cache no other pull request can read. Sixteen such caches
now hold twelve point two gigabytes against a documented ten-gigabyte repository
ceiling, so least-recently-used eviction is discarding them faster than they can
be reused — which is why even a repeat run on the same branch misses.

**A title change rebuilds everything.** The workflow triggers on the `edited`
pull-request event, which fires when a title or body is edited and not otherwise.
It is there to serve one step that takes one second: the conventional-commit check
on the pull request title. Because the stacking tool creates a pull request and
then sets its body, two full runs against a byte-identical commit are the normal
outcome of submitting one — observed twice, eighteen and nineteen seconds apart,
thirteen to fifteen minutes each.

**Nothing cancels a superseded run.** The release workflow declares a concurrency
group; the integration workflow declares none. Across the last sixty runs there
were forty-six distinct commits, so fourteen runs — one hundred and eight minutes
— were computing an answer that was already obsolete, every one of them superseded
within five minutes of starting.

## Goal

A pull request that changes no Rust finishes in a small number of minutes, and
runs once per commit rather than once per event.

## Constraints

- **The status check named `integration` is required by the default-branch
  ruleset.** Renaming that job, or moving it to a workflow that does not run on
  every pull-request commit, makes pull requests unmergeable. This is the tightest
  constraint on the design and the reason for several choices below.
- **A check that never runs blocks merging.** GitHub documents that a workflow
  skipped by filtering leaves its check pending, and a pending required check
  blocks the merge. Whatever is required must therefore run on every commit.
- **The release workflow is the only remaining proof that bundling works.** It
  builds all four platform targets on every push to the default branch, so a
  bundling fault is caught at merge rather than never — but it is caught after
  merge, not before.
- **The ten-gigabyte repository cache ceiling is shared** by the cargo caches, the
  pnpm caches, and the apt package cache. A fix that leaves per-pull-request
  entries at their present size re-creates the eviction thrash it was meant to end.
- Signing keys are repository secrets. Whether they are exposed to a given run is
  a property of that workflow's environment.

## Architecture

Three trigger surfaces, separated by what each one costs and what each one proves.

**The title check** becomes its own workflow, triggered on the pull-request events
that can change a title and on nothing else. It needs no checkout and no
dependencies; it reads the title through the API and exits in about a second. It
is separated not to save its own second but to take the `edited` event off the
expensive workflow entirely.

**The integration gate** keeps its job name, and loses the `edited` trigger. It
gains a concurrency group keyed on the pull request, so a new commit cancels the
run its predecessor started. Its Rust steps change shape: the tests still compile
and run in the debug profile, and the release-profile step compiles the binary and
builds the frontend without invoking the bundler. What it proves becomes "this
compiles on both profiles, the tests pass, and the frontend builds" rather than
"an installer can be produced". Because the bundler is what consumes the signing
keys, they leave this workflow's environment as a consequence rather than as a
separate change.

**A warming job** runs on push to the default branch. Its only purpose is to
populate a cache that pull requests are permitted to read — the same GitHub rule
that isolates pull requests from each other allows any of them to restore from the
default branch. This is the piece whose absence made the existing restore keys
dead, and adding it is what turns them live.

The cache mechanism itself is replaced rather than repaired. The hand-rolled
version caches the whole target directory unconditionally, which is how entries
reach one and a half gigabytes; the standard Rust cache action prunes the registry
source tree, drops artifacts belonging to the workspace's own crates, and discards
anything older than a week, so entries land far smaller. It also takes a
conditional-save input, which lets pull requests restore without writing — so the
ceiling is consumed by one shared entry rather than by one per branch.

Note what this does not buy: the action deliberately does not cache the
workspace's own crates, on the grounds that they recompile anyway. The saving is
on dependency compilation, which is the larger share of a cold Tauri build but not
all of it. The gain should be measured, not assumed.

## Approach

The three trigger faults are independent of the Rust changes and carry no
judgement, so they land first within the single change: concurrency group, the
`edited` split, then the warming job and the cache swap. The bundler removal comes
last, because it is the only part whose effect on the run time is uncertain until
the cache is working — measuring it against a cold-cache baseline would attribute
the cache's saving to it.

The risky part is the cache, and it is risky in a way that is cheap to detect: the
restore step's duration is the tell. One second means a miss and a cold build, as
it does today. The first pull request opened after the warming job has run on the
default branch is the measurement.

**Options considered and rejected:**

*Keeping the full bundle in the gate.* Rejected because the artifacts are
discarded and the release workflow proves the same thing on four platforms within
minutes of merge. The trade accepted is that a fault confined to bundling —
an icon path, a resource declaration, a bundle setting — now surfaces on the
default branch rather than on the branch that caused it.

*Dropping only the signing keys, keeping the bundler.* Rejected as the smaller
half of the same change: it removes the secret exposure but keeps most of the six
minutes, and updater artifact generation is part of what the bundler step does.

*Repairing the existing cache without a warming job.* Rejected because it treats
the symptom. Smaller entries ease the eviction pressure, but a fresh branch still
has nothing to restore from, and a fresh branch is every ticket.

*Adding a warming job while keeping the hand-rolled cache.* Rejected as the
smallest diff that still leaves the ceiling exceeded — one and a half gigabytes
per entry against ten gigabytes total will keep evicting the very cache the
warming job exists to preserve.

*Skipping the integration job on the `edited` event with a condition, keeping one
workflow file.* Rejected on evidence. GitHub documents that a workflow skipped by
filtering leaves a required check pending and blocks the merge, but documents
nothing about a job skipped by a condition. Since the check is required, being
wrong means unmergeable pull requests, and the alternative costs one extra
workflow file. A design resting on undocumented behaviour was not worth that.

## Acceptance criteria

- A pull request that changes only markdown reports its integration check
  without compiling the Rust crate from cold — evidenced by a cache restore step
  taking materially longer than one second.
- Editing a pull request's title or body starts no run of the integration
  workflow, and still reports a conventional-commit verdict on the title.
- Pushing a second commit to a branch while the first is still running leaves
  exactly one run in progress for that branch.
- A pull request whose title is not a valid conventional commit is still
  identifiable as such from its checks.
- The default branch's ruleset still finds the status check it requires, and a
  pull request that passes is still mergeable.
- No workflow that runs on a pull request has the updater signing keys in its
  environment.
- Total repository cache usage sits below the documented ceiling with several
  pull requests open at once.

## Risks

**The required check stops being satisfiable.** The highest-consequence risk: a
change to the workflow that stops the required job reporting makes every pull
request unmergeable, including the one carrying the fix. Detection is immediate —
the pull request implementing this is itself the test, and it is visible in its own
merge box. The mitigation is that the job's name and its per-commit trigger are
both treated as fixed points.

**Title linting silently stops blocking merges.** The ruleset requires exactly one
check, and it is the integration job. Moving the title lint into its own workflow
makes it a new check that the ruleset does not know about, so a bad title will
report a failure that nothing enforces. This is a repository setting rather than a
code change, and it is the one part of this that cannot be done from a commit.
Detection: open a pull request with a deliberately malformed title and see whether
the merge box objects.

**A bundling fault reaches the default branch.** Accepted deliberately, above.
Detection is the release workflow, which fails loudly on the merge commit and
before any release is published. The exposure window is one merge.

**The cache saving is smaller than hoped.** The action does not cache the
workspace's own crates, so a floor exists below which compilation will not drop.
Detected by the same measurement that validates the cache at all; if the floor is
high, the remaining lever is the compilation profile rather than the cache, and
that is a separate change.

**The apt package cache has the same disease and is not treated here.** It missed
on the measured run and fell back to a forty-eight-second install. The warming job
will populate a default-branch entry for it as a side effect of running the same
steps, but that is a hoped-for consequence rather than a designed one.

## Out of scope

- **ESLint's one minute fifty-five.** Real, and the next candidate, but its fix is
  a content-addressed lint cache whose viability across runners is unestablished.
  Bundling an unmeasured change into a change whose whole purpose is measurement
  would make both unreadable.
- **The labeler workflow's two runner jobs per push.** Roughly twelve seconds each
  and unaffected by anything here.
- **The full-history fetch depth in the integration checkout.** Needed only by the
  release workflow's changeset tooling; on a repository this size it costs about
  two seconds, which does not justify the risk of discovering a consumer of it.
- **The compilation profile.** Tuning optimisation or codegen settings changes what
  the release build produces, and belongs with whoever owns release performance.
- **Adding the new title check to the branch ruleset.** A repository setting, not a
  file, and therefore the user's action rather than this change's.
