# rentable

<!--
  Installed by /configure. The root entrypoint: every turn pays for it, and it
  is committed, so every Claude that opens the repository loads it — plugin or
  not. It carries only what holds either way, and reaches the rest by pointer;
  every file it points at is committed too, so a reader without the plugin
  follows the same pointers — only the slash commands need it.

  Placement is by **loading mechanism**, not by subject — the three tiers the
  AEP specification names:

    boot tier      this file, and `.claude/rules/` with no `paths:` frontmatter
                   — always-on, loaded by the harness on every turn
    scoped tier    `.claude/rules/` with `paths:` — loads when a covered file is read
    pointer tier   everything reached by a pointer, including `.claude/protocol.md`

  Membership in the boot tier is selected by one test — would this norm's
  absence on a turn cause behavioral drift. A rule that must fire
  unconditionally goes in the first two tiers, never behind a pointer a stage
  has to follow — that fires only when the stage runs, which is a silent
  failure. Keep this file under 200 lines.
-->

An offline-first desktop tracker for rents payments — a Tauri 2 (Rust) shell around a
SvelteKit 2 / Svelte 5 frontend, with a local SQLite database and optional Google Drive
backup. There is no server; everything runs in the desktop app.

## Rules that always apply

`.claude/rules/precedence.md`, `.claude/rules/engineering.md`, `.claude/rules/placement.md`, and `.claude/rules/boundary.md` are always-on and never restated here — a standard with two homes drifts at one of them. The rest of that directory is path-scoped by `paths:` frontmatter, and holds standards discovered in **this repository**: the API layer, the frontend, module layout, and testing.

## Knowledge layers

| Layer     | Answers                        | Lives in              |
| --------- | ------------------------------ | --------------------- |
| Codebase  | what currently exists          | source                |
| Context   | how this repository thinks     | `.claude/contexts/**` |
| Decisions | why this approach was selected | `.claude/decisions/`  |

The order is absolute: where they disagree, the Codebase is right — fix the documentation, never the reverse. Load `.claude/contexts/map.md` at session start — routing only; Domain Contexts load on demand, and loading them all defeats the point.

## Machinery

`.claude/protocol.md` is the router — the verification machinery and the stage table — reached by pointer, so a question turn never pays for it. `.claude/modes/` holds one posture per file; `.claude/policies/tracker.md` where tickets live; `.claude/policies/version-control.md` how work lands, including that **this repository is on Graphite and `gt` replaces `git commit`**; `.claude/tools/` how to _type_ it.

## Verification at use

**Never a scan. Never a phase.** A Context statement is checked against the Codebase at the point of use; scope is what the work touches. **Source Pointers are verified before use, always** — a broken one is searched for, never invented; the router has the machinery. Fix drift where you find it, in the same breath — nothing else catches a lapse.

## Architectural boundaries

The boundaries in `.claude/contexts/repository.md` are enforced. **Do not add a violation,
and do not fix an existing one opportunistically** — an unrelated correction folded into a
change makes that change unreviewable, and it takes the work off whatever ticket was scoped
for it. A divergence found in passing gets its own ticket.

## Which stage a request enters

A question gets an answer: load, answer, stop. A change, every turn, command or not: **state the classification** — what kind of change, how much process, and **which stage it enters** — one line, before touching anything, so the user can disagree — **then enter that stage**; how each is reached is the router's.

Top to bottom, first match wins — the four lower rows are read rather than judged:

| The request                                        | Enters                      |
| -------------------------------------------------- | --------------------------- |
| it would change another repository                 | nothing — report, hand back |
| a question about how something works               | nothing — answer, stop      |
| this tree already holds a claim                    | the build, resuming it      |
| a ticket is ready to build                         | the build                   |
| it arrived from outside — an issue, a pull request | triage                      |
| anything else that would change code               | design                      |

**A loaded norm that settles a question is acted on, citing the line — never re-asked.** Asking is for genuine forks only.

## Framework law

**A file declaring `owner: framework` is followed as written — never edited, healed, or debated.** Variation enters only through the extension points it names; anything else is a declared deviation, loud in every audit. Unstamped files are the repository's, healed as ever.

## Writing knowledge

CI never modifies repository knowledge: `.claude/contexts/**` and `.claude/decisions/**` change only through the workflow's commands. Before any write into knowledge, the compression test: _will this improve a future engineering decision?_ If not, don't write it. What belongs in Context: `.claude/policies/context.md`.

## Conventions

**The workflow's conventions are defaults for when the repository is silent**: detect before asserting, and where the repository's own convention is genuinely worse, say so once, with reasoning, then follow it. Defaults: `.claude/policies/version-control.md`.

This repository is not silent about several of them. Commit and PR titles, the pull request template, changesets, and CI's gate are all in `.claude/policies/version-control.md`; its label vocabulary is in `.claude/policies/tracker.md`.
