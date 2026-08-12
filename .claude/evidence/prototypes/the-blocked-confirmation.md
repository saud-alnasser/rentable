---
owner: repository
kind: prototypes
falsifies: []
---

# Does the rebuilt confirmation dialog read as designed in the blocked case, where nothing destructive may be offered?

Verified against: Svelte 5.56 / SvelteKit 2.70, Tauri 2 on WebView2 (Edg 151), in the running
desktop app against the developer database, 2026-08-12
Conclusion: Successful

#411's declared increment. The dialog every record's delete opens was rebuilt as a whole, and the
case that decides whether the rebuild works is the one where the action cannot be performed at
all: a complex holding units, a tenant holding contracts. The design's own risk register named it
— withholding the destructive control could read as an answer, or as a surface that failed to
finish loading, and only looking at it separates those.

Three variants of the blocked body, switchable on the real `/complexes/[id]` record.

## Hypothesis

That A — the built shape, refusal stated as a sentence under the record's name, blockers listed,
one solid **close** — would read as an answer, and that the risk lay in the *absence* of the
destructive control rather than in anything present.

The expectation was that B, which drops the footer entirely and lets the corner ✕ be the only way
out, would be the interesting one: if a dialog can answer without a footer, the footer on A is
ceremony.

## Method

Sub-shape A: the variants rendered inside the real complex record, against the developer
database, with the real sidebar, real record surface and real blockers computed from the units
the complex actually holds. The case judged was **Adams Street 1** — 4 units, 1 occupied, 3
vacant — which blocks deletion on `4 unit(s) belong to it`.

| | The reading |
| --- | --- |
| A | **refusal as a sentence** — the action titles the dialog, the record's name and the refusal share one paragraph, blockers in a muted block, one solid `close`. As built. |
| B | **refusal as the title, no footer** — the refusal names the dialog, the record and blockers sit under it, and the only way out is the corner the dialog already carries. |
| C | **blockers inventoried, refusal implied** — the action titles the dialog, the blockers are muted rows under a counted heading, on the treatment a contract's units are transferred on. Never states a refusal. A quiet ghost `close`. |

The code lived in `src/lib/prototype/` beside the switcher rather than under
`.claude/position/prototypes/`, per the drift finding
[prototype-code-cannot-live-where-the-policy-puts-it](../drift/prototype-code-cannot-live-where-the-policy-puts-it.md).

The app was driven over the WebView2 debugging port — CDP `Runtime.evaluate` to reach the record
and press delete, `Page.captureScreenshot` for each variant — rather than by pointer. What that
does and does not cover is under Limitations.

## Result

**A, chosen by the user from the three screenshots.**

**The hypothesis about B was wrong, and it failed for two reasons neither of which was the
missing footer's absence in principle.** Dropping the footer left the card visibly unterminated:
one blocker in a body sized for a list, then nothing, and the eye keeps going looking for the
control that is not there. And `Dialog.Title` carries `capitalize`, so a sentence used as a title
came out title-cased — *"This Cannot Be Deleted While The Following Still Depend On It."* — and
wrapped to two lines into the ✕. The second is a defect of putting a sentence where a title goes,
and it is a general one: the title slot in this dialog is for a phrase.

**C failed on the same class of mistake at a different scale.** Its counted heading uses the
uppercase tracked treatment built for a two-word label, and a full sentence in it reads as
shouting across two lines, with the `(1)` stranded at the end. The *row* treatment for blockers
was good — it reads as an inventory of what exists rather than a notice — but nothing else in the
variant survived to carry it.

**A's defect, seen only on screen.** The record's name and the refusal share one paragraph, so
they read as one sentence with two subjects: *"**Adams Street 1** this cannot be deleted while
the following still depend on it."* Reading the markup, the bold name and the muted sentence look
like two things; rendered at this size and width they do not.

**One blocker in a container built for a list looks heavy** in every variant. The blocked case is
usually one line, not several, and all three were designed for the plural.

## Limitations

- **Driven over CDP, not by pointer or keyboard.** Every press was a synthetic `element.click()`,
  so nothing here exercises #411's *reachable and operable by keyboard throughout*, nor the
  pointer path. That criterion remains unverified by this prototype.
- **One record, one blocker kind.** Only a complex blocked by units was seen. A tenant blocked by
  contracts, a contract blocked by payments, and any record with **several** blockers at once
  were not — and the last is the case the list treatment exists for.
- **English and LTR only.** Arabic was not opened. B's title-casing defect is locale-specific in
  a way that matters here: `capitalize` does nothing to Arabic, so that variant would have failed
  in one locale and not the other, which is an argument for keeping sentences out of the title
  slot rather than for anything about B.
- **Not seen at the smallest window the shell supports**, where the wrap that broke B's title
  would happen sooner in A too.
- **Nothing was measured.** Every answer is a judgement made by looking at three screenshots.

## Conclusion

Successful. The blocked case as built reads as an answer rather than as a failure, and the
question the increment was declared for is settled: withholding the destructive control is
legible, provided the dialog still terminates in a control that ends it.

The finding worth keeping is narrower than "A won", and it is about the *slots* rather than the
variants: **this dialog's title takes a phrase and its headings take labels, and both break when
given a sentence.** B and C failed on that one property, in two different slots, and neither
failure was visible in the markup — `capitalize` and `uppercase tracking-[0.2em]` are invisible
until a sentence is put through them. That is what would decide the next question about this
surface, which is what makes it more than a preference between three screens.

A's own defect — the record's name reading as the subject of the refusal's sentence — was fixed
in the same change that records this: the name takes its own line. What the user chose between
was three readings of the blocked case, and the run-on was a fault in the winner rather than a
property of it, so carrying it forward would have shipped a defect this prototype existed to
find.

Not recorded as a Decision: how a confirmation is composed is the design document this increment
belonged to, and the shared block is the implementation of it. The code is deleted.
