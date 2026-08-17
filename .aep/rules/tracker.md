---
aep: 2.3.0
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

## What a ticket's body looks like

[[templates/ticket.template]] is the shape, and it applies here even though it is written for
a local file — this repository has an external tracker, so the frontmatter has no home and its
fields are carried by GitHub instead:

| Template frontmatter | Where it lives here |
| --- | --- |
| `status` | the issue's own open/closed state — never mirrored into the body |
| `part-of` | the sub-issue relationship to the effort's map, **and** a `Part of #<map>` line |
| `blocked-by` | the native blocking relationship, **and** a `Blocked by:` line |

So a ticket opens with one line carrying `Part of`, `Blocked by`, and which requirement and
criterion of the spec it traces — then a link to the spec naming the sections that are
authoritative — and then the template's five sections, in its order and under its headings:

```
## Outcome              one paragraph: what is true when this is done
## Acceptance Criteria  checkboxes, each traceable to a criterion in the spec
## Relevant areas       paths, and where to start reading
## Constraints          what the implementer must respect that the spec does not say —
                        rejected alternatives, test obligations, declared increments
## Notes                findings accepted, decisions recorded, split provenance
```

**A declared increment — research, grilling, prototype — is a Constraint**, not a section of
its own: it binds the implementer before building and reads as optional anywhere else.

*Why the duplication in the first two rows is not mirroring: the native relationship is
structured and queryable, the body line is what a human reads without opening the sidebar.
`status` is the one that must never be duplicated — two places to read whether work is done is
one place to be wrong.*

## What a map's body looks like

**The map is not a ticket and does not take the shape above.** It indexes an effort, so it
takes **the spec's own section names** — [[templates/spec.template]]'s — and under each one it
gists what the spec says and links it. A heading on the map and a heading in the spec are then
the same subject, and a reader moves between them without translating.

```
## Problem  ## Goal  ## Scope  ## Sequence*  ## Constraints
## Decisions  ## Open Questions  ## Risks  ## Out of scope  ## Drift found*
```

Two are the tracker's alone and are marked as such where they appear:

- **Sequence** — what order the tickets are taken in, and what gates what. The sub-issue list
  carries state and cannot carry order. **Omitted where an effort has no tickets yet.**
- **Drift found** — what the effort discovered about the repository that no spec section owns.

`Decisions` indexes the spec's Architecture and its decision sections; `Open Questions` is
what is not yet specified. **Omit a heading rather than writing "N/A" under it**, exactly as
the spec template says — an absent section reads as not yet reached, which is usually the
truth.

**Nothing on a map is the source of truth for anything.** Live ticket state is the sub-issue
list, and every claim under a heading belongs to the spec. *Why: a map that starts asserting
rather than indexing is a second spec, and it is the copy that drifts.*

## Assignment

GitHub assignees. Claiming is `gh issue edit <n> --add-assignee @me`.

Assignment is **read and never written unasked.**

## Label vocabulary

Every label is `<emoji> <category>: <value>`, and there are five categories. **The
convention is what is recorded here; the values are read from the tracker.**

| Category | What it says | Who sets it |
| --- | --- | --- |
| `type:` | what kind of work this is | AEP, from the ticket's conventional type |
| `flag:` | triage state, and metadata about the issue itself | triage — the human, mostly |
| `status:` | where the work has got to | triage; see the collision below |
| `priority:` | how urgent it is | **the human only** — AEP never assigns urgency |
| `size:` | how large a pull request is | describes a **pull request**, not an issue |

**Read the whole list before applying or proposing a label**, never the first page — the
ladder in [[skills/tasks/labels]] requires it before anything is created, and the
vocabulary here is longer than the default page. [[references/github]] has the invocation
and what the flag does.

*Why the values are not enumerated here: a copy of the tracker's own list is stale the
moment somebody adds or renames one, and a reader cannot tell a stale copy from a current
one. The categories do not move; the values do — and so does how many there are.*

**The exception is the Roles table below**, which names six labels exactly. Those are not
the vocabulary — they are the mapping from AEP's canonical roles onto it, and a mapping
has to name both sides to say anything. It is governance, so it is maintained
deliberately; the rest is read.

**No label carries effort membership or gating.** Both are native GitHub relationships —
[[references/github]], under *What carries an effort here*, has the carriers and the query.
A label beside either would be a hand-maintained second copy that disagrees with the first
the moment somebody uses GitHub's own interface.

## Roles

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
