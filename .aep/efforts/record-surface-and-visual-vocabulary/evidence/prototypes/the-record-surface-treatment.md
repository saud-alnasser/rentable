---

---

# How does a record present its own data, once the field tiles are gone?

Verified against: Svelte 5 / SvelteKit 2, Tauri 2, Tailwind v4, in the running desktop app
against the developer database, on the real `api.contract.get` and `api.tenant.get` reads,
2026-08-12
Conclusion: Successful

Consumed: [[efforts/record-surface-and-visual-vocabulary/spec]], "Architecture" — the
specification list is hairline-separated aligned rows, not an unruled two-column list.

The design document specified the treatment in prose and the first ticket carried an increment
to correct it while building. That loop ran twice and failed twice — a bare two-column list was
built, looked at, and rejected; the section model was changed underneath it and it was rejected
again. The third attempt is this: four treatments on one switcher, on real data, judged before
anything reaches the record surface.

## Hypothesis

That the complaint was about the **specification list** — its density, its rhythm, its alignment.
The expectation was that a compact treatment would win, because the collection below competes for
the same window and the contract carries six fields over a virtualized ledger.

## Method

Four treatments on `src/lib/prototype/switcher.svelte`, rendered on a throwaway route against
contract #1 and its tenant through the real query hooks — the same reads
`contract/component/details.svelte` makes, so every value is a real one and none was seeded.

| | Treatment |
| --- | --- |
| control | the shipped shell: filled `bg-muted` slab, fields in an unruled two-column list below it |
| A | masthead, no panel; fields in a three-column grid band under a hairline, label above value |
| B | masthead; fields in a 14rem rail beside the collection rather than above it |
| C | masthead; fields as aligned rows, fixed label column, hairline between rows |

Judged from screenshots by the human, who was on a remote terminal — which is also why the
treatments were switched rather than compared side by side.

## What it showed

**Every treatment that dropped the filled panel beat the control**, and that was the clearest
result of the four. The slab spends roughly a third of the window on a name and an eyebrow, and
because the fields sit outside it they read as belonging to nothing. The panel was the fault, not
the list.

**The discriminator was one the mock could not have found: the contract's government identifier
is a UUID.** At three columns A truncates it, and B truncates it harder while taking about 250px
of width from the ledger. Only the control and C show it whole — and it is the field a reader is
most likely to have opened the record to read. A prototype on invented data would have chosen A.

**A is the most compact and C is the most legible.** Six fields cost A about 130px and C about
230px, against roughly 650px of usable height once the frame and title are paid for; both leave
the ledger a workable column. C also renders identically whether a record has one field or six,
which matters because four of the five records have one or two.

**B's rail is mostly empty even on the six-field record.** On a tenant it would be a single row
in a column of its own beside a narrowed list.

## Chosen

**C — aligned rows.** A fixed label column, values aligned down the page, a hairline between rows
and no boxes. The hairlines are the part the design document did not have: an unruled list at
this row height reads as loose text, and the rule is what makes it a specification rather than a
paragraph. This is *Use fewer borders* (224 / 238) taken as far as it goes and no further — one
hairline per row is the least separation that still groups, where the tiles used a border and a
fill for the same job.

## What stayed open

- Whether the hairline survives at one row. On the tenant record C renders a single row with no
  rule at all, and whether that reads as intentional was not tested — it is the surface #390
  builds, so it is answered there.
- The switcher's own placement forced the throwaway route: **Vite refuses to serve a component
  from the protocol directory**, which is where the protocol then said
  throwaway prototype code belongs. It was written to `src/lib/prototype/` beside the switcher
  and deleted afterwards. Recorded as a drift finding rather than healed here, because the policy
  is framework-owned.
