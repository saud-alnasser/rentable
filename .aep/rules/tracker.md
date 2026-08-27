---
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

**A file, not an issue.** A ticket lives at `.aep/efforts/<effort>/tickets/<NN>-<slug>.md`
and never becomes a GitHub issue of its own. AEP opens exactly two tracker objects for an
effort — one issue carrying `spec.md`, one pull request carrying the approach — and
[[policies/execution]] is where that count is fixed.

**Branch-bound.** One ticket becomes one branch, which lands as one unit of review — from
[[rules/version-control]], under *One ticket, one branch, one commit*.

Work that produces no branch — a decision, an investigation — is **not a ticket here**.
Decision work lives in its effort's `spec.md`.

*Why the count is two: per-task issues made a reader reconstruct the effort from a list of
fragments. One issue is the effort, and its tasks sit in the repository beside the spec they
trace to.*

## What a ticket's body looks like

[[templates/ticket.template]] is the shape, and the frontmatter has a home now: the ticket is
a file, so its fields sit in the file and nothing is carried by GitHub.

| Template frontmatter | Where it lives here |
| --- | --- |
| `status` | the file's own `status:` — `open`, `resolved`, or `obsolete` |
| `blocked-by` | the file's own `blocked-by:`, and nothing else |

**`part-of` is retired.** The effort is the directory the ticket sits in, and a field
restating it is a second answer that can disagree with the first.

So a ticket opens with a `Blocked by:` line where something gates it — then a link to the
spec naming the sections that are authoritative — and then the template's five sections, in
its order and under its headings:

```
## Outcome              one paragraph: what is true when this is done
## Acceptance Criteria  the requirement and criterion numbers it traces, then the
                        checkboxes. validate.mjs reads the citation from this section and
                        from nowhere else, so a trace in the opening line does not count
## Relevant areas       paths, and where to start reading
## Constraints          what the implementer must respect that the spec does not say —
                        rejected alternatives, test obligations, declared increments
## Notes                findings accepted, decisions recorded, split provenance
```

**A declared increment — research, grilling, prototype — is a Constraint**, not a section of
its own: it binds the implementer before building and reads as optional anywhere else.

*Why nothing is mirrored onto GitHub any more: a task held in two places is a task whose two
copies disagree the first time one is edited. The tracker carries the effort; the repository
carries its tasks.*

## What the effort issue's body looks like

**There is no map.** The effort issue *is* the effort, and its body is `spec.md` —
[[skills/specify]] opens it that way, with each requirement's acceptance criterion as a
checkbox. A second document indexing the spec would be a second place the spec can change.

The pull request carries the approach from `plan.md`, and each ticket's criteria as
checkboxes — or says the tickets are not yet cut, never an empty list.

The two things the map carried that no spec section owns still have homes:

- **Sequence** — what order the tickets are taken in, and what gates what — is `blocked-by:`
  on the tickets themselves. It is an edge a script reads rather than prose somebody
  maintains.
- **Drift found** — what the effort discovered about the repository — goes in the spec, under
  the section it bears on, or in a rule where it turns out to govern.

**Neither tracker body is the source of truth.** `spec.md` and `plan.md` are what the effort
is, and both bodies are projections of them ([[policies/execution]]). Where one disagrees
with the file, the file wins and the body is corrected — never the reverse.

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
ladder in [[policies/execution]] requires it before anything is created, and the
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
