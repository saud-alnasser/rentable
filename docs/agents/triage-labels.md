# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

This repo already had an established label vocabulary (emoji + `category: value`), so every role maps onto an **existing** label — `/triage` should apply these, never create new ones.

| Label in mattpocock/skills | Label in our tracker  | Meaning                                  |
| -------------------------- | --------------------- | ---------------------------------------- |
| `needs-triage`             | `📝 flag: triage`     | Maintainer needs to evaluate this issue  |
| `needs-info`               | `💬 flag: discussion` | Waiting on reporter for more information |
| `ready-for-agent`          | `🎯 status: ready`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `🎯 status: ready`    | Requires human implementation            |
| `wontfix`                  | `🛑 flag: wontfix`    | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## The `status: ready` collision

`ready-for-agent` and `ready-for-human` both map to `🎯 status: ready`. This repo does not distinguish agent-ready from human-ready work at the label level, and that was a deliberate choice — no new labels were introduced.

Consequences, which skills must respect:

- **Writing.** Applying either role produces the same label. Don't attempt to encode the distinction by inventing a second label.
- **Reading.** `🎯 status: ready` is ambiguous. **Default to treating it as `ready-for-human`.** Do not auto-dispatch a `🎯 status: ready` issue to an AFK agent on the strength of the label alone.
- **Overriding the default.** If an issue should go to an agent, say so explicitly in the issue body or a comment. An explicit statement beats the label.

The asymmetry is intentional: an agent picking up work that was never cleared for it is a worse failure than a human picking up work an agent could have done.

To remove the ambiguity later, split the right-hand column — e.g. add `🤖 status: ready for agent` — and delete this section.

Edit the right-hand column to match whatever vocabulary you actually use.
