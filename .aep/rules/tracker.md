---
aep: 2.1.1
owner: repository
date: 2026-08-17
kind: rule
mode: [specify, plan, implement, review]
use-when: "creating, reading, claiming, or labelling a ticket, or deciding whether work is a ticket at all"
---

# Rule — tracker

## Which tracker

**GitHub issues, on `saud-alnasser/rentable`.** The invocations are in [[references/github]].

Issues and PRDs both live as GitHub issues. "Publish to the issue tracker" means create a
GitHub issue; "fetch the relevant ticket" means read one with its comments.

**Never guess the CLI.** A tracker operation with no entry in [[references]] is a docs
fetch, not an assumption.

What happens to a ticket once somebody starts building it — the branch convention, the
commit discipline, how work lands — is [[rules/version-control]]'s.

## What a ticket is

**Branch-bound.** One ticket becomes one branch, which lands as one unit of review — from
[[rules/version-control]], under *One ticket, one branch, one commit*.

Work that produces no branch — a decision, an investigation — is **not a ticket here**, and
opening one anyway creates an issue nothing can ever close by merging. Decision work lives
in its effort's `spec.md`, and the map itself is a pinned issue.

*Why: a ticket that no merge can close sits open forever and stops meaning anything.*

## Assignment

GitHub assignees. Claiming is `gh issue edit <n> --add-assignee @me`.

Assignment is **read and never written unasked.**

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
once it has been cut into work. Nothing carries both.

### The `status: ready` collision

`ready-for-agent` and `ready-for-human` are the same label here. That was deliberate — no
new labels were introduced — and it has consequences:

- **Writing.** Either role produces the same label. Do not encode the distinction by
  inventing a second one.
- **Reading.** `🎯 status: ready` is ambiguous. **Default to `ready-for-human`.** Never
  dispatch to an agent on the strength of the label alone.
- **Overriding.** An explicit statement in the issue body or a comment beats the label.

*Why the asymmetry is intentional: an agent picking up work never cleared for it is a worse
failure than a human picking up work an agent could have done.*

To remove the ambiguity later, split the right-hand column and delete this section.

## External pull requests

**No.** Pull requests are not a request surface here — they are not pulled in unasked. A
pull request named explicitly is still triaged.

## Resolving a bare reference

GitHub shares one number space across issues and pull requests, so `#42` may be either.
Resolve by looking — try the pull request, fall back to the issue.
