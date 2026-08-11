---
owner: repository
tracker: github
spec-home: flat
ticket-model: branch-bound
---

# Tracker

## Which tracker

| Tracker    | Tickets live in                                       | Driven by                                                |
| ---------- | ----------------------------------------------------- | -------------------------------------------------------- |
| **GitHub** | this repository's issues, at `saud-alnasser/rentable` | `gh` — the invocations are in `.claude/tools/github.md` |

Issues and PRDs both live as GitHub issues. "Publish to the issue tracker" means create a
GitHub issue; "fetch the relevant ticket" means read one with its comments.

**Never guess the CLI.** A tracker operation with no entry in `.claude/tools/` is a docs
fetch, not an assumption.

What happens to a ticket once somebody starts building it — the branch convention, the
commit discipline, how work lands — is `.claude/policies/version-control.md`'s.

## Where a spec lives

**Flat, in `.claude/designs/<slug>.md`**, and their index is `.claude/designs/map.md`. The
other layout — one spec per effort, beside the tickets it governs — needs the tickets to be
on disk, and here they are GitHub issues. The two layouts are exclusive, and the index
regeneration refuses a tree holding both.

Decision work has no ticket and so no effort directory either. Its sections live in the
design document for that effort, in the same directory, and the map itself is a pinned
issue — `.claude/policies/maps.md` has the form.

## What a ticket is

**Branch-bound.** One ticket becomes one branch, which lands as one unit of review — from
`.claude/policies/version-control.md`, under *One ticket, one branch, one commit*: "One
ticket becomes one `gt create`, which produces one branch carrying exactly one commit, which
becomes one pull request."

Work that produces no branch — a decision, an investigation — is not a ticket here, and
opening one anyway creates an issue nothing can ever close by merging.
`.claude/policies/maps.md` says where decision work lives instead.

## Assignment

GitHub assignees. Claiming is `gh issue edit <n> --add-assignee @me`.

AEP reads Assignment and never writes it unasked.

## Roles

This repository has an established emoji label vocabulary (`<emoji> <category>: <value>`).
Every canonical role maps onto a label that **already exists** — apply these, never create
new ones.

| Canonical         | Label in this repository |
| ----------------- | ------------------------ |
| `needs-triage`    | `📝 flag: triage`        |
| `needs-info`      | `💬 flag: discussion`    |
| `ready-for-agent` | `🎯 status: ready`       |
| `ready-for-human` | `🎯 status: ready`       |
| `wontfix`         | `🛑 flag: wontfix`       |

| Canonical     | Label in this repository |
| ------------- | ------------------------ |
| `bug`         | `🐞 type: bug`           |
| `enhancement` | `✨ type: enhancement`   |

These are **triage roles** — they describe an issue somebody else opened, and what has to
happen before it can be worked. They are not the build lifecycle a ticket moves through
once `/design` has cut it; that vocabulary is `/design`'s. Nothing carries both.

### The `status: ready` collision

`ready-for-agent` and `ready-for-human` are the same label here. That was deliberate — no
new labels were introduced — and it has consequences:

- **Writing.** Either role produces the same label. Do not encode the distinction by
  inventing a second one.
- **Reading.** `🎯 status: ready` is ambiguous. **Default to `ready-for-human`.** Never
  dispatch to an agent on the strength of the label alone.
- **Overriding.** An explicit statement in the issue body or a comment beats the label.

The asymmetry is intentional: an agent picking up work never cleared for it is a worse
failure than a human picking up work an agent could have done.

To remove the ambiguity later, split the right-hand column and delete this section.

## External pull requests

**No.** PRs are not a request surface here — `/triage` does not pull them in unasked. A PR
named explicitly is still triaged.

## Resolving a bare reference

GitHub shares one number space across issues and pull requests, so `#42` may be either.
Resolve by looking — try the pull request, fall back to the issue.
