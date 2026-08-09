---
kind: drift
falsifies: [.claude/decisions/0009-the-shipping-list-block-is-rewritten-under-a-new-name.md]
---

# ADR 0009 cites ADR 0007 for a claim ADR 0007 does not make

Checked against: `0652708` (`main`)
Area: the interface overhaul — map [#211](https://github.com/saud-alnasser/rentable/issues/211)
Consumed: `.claude/decisions/0013-list-presentation-is-per-concept.md` — #211 decision 07

## What was checked

ADR 0009's final paragraph keeps `src/lib/design/primitive/data-table/` on this reasoning:

> The primitive wraps table-core into `createSvelteTable` and `FlexRender`, which is exactly
> what the replacement needs, so deleting it would mean regenerating it — and regeneration is
> what ADR 0007 established this repository cannot safely do.

ADR 0007 was read for that establishment and says the opposite, in its Consequences:

> `add` for a genuinely new primitive still works and stays safe — but it arrives in upstream's
> default style, not Rhea's, so fitting it to the surrounding geometry is part of adding it, in
> the same way wiring it to the i18n store already is.

`.claude/rules/frontend.md` draws the same split — adding is safe, replacing is what there is no
way back from — and scopes the hazard to `add --overwrite` and `init --reinstall` over files
already present. The specific damage 0007 names is the silent loss of i18n store reads and `dir`
handling in a regenerated file, and none of the four files in `src/lib/design/primitive/data-table/`
reads the i18n store, so that hazard does not reach this primitive family at all.

## To re-run the check

```bash
git show 0652708:.claude/decisions/0009-the-shipping-list-block-is-rewritten-under-a-new-name.md | tail -8
git show 0652708:.claude/decisions/0007-rhea-geometry-is-hand-ported.md | sed -n '34,38p'
grep -rln 'i18n\|locale' src/lib/design/primitive/data-table/   # expected: no matches
```

## What it reaches, and what it does not

0009's conclusion stands on its other argument alone: an unimported file in `design/primitive/`
is the normal state of a generated catalogue, and `empty` and `pagination` already sit there
unused. Only the supporting citation is false.

It is false in the direction that spreads. Taken at face value it says no primitive can ever be
regenerated — a stronger constraint than 0007 imposes, and one that rules out the safe `add` path
0007 deliberately preserves.

## Why this is a finding rather than a fix

A committed ADR's prose is frozen, and a falsified Decision is never healed inline —
`.claude/policies/decisions.md` and `.claude/policies/knowledge.md` respectively. Whether 0009 is
superseded over one wrong supporting sentence, or the mis-citation is accepted with a note, is a
judgement about how much churn a factual error in a non-load-bearing clause is worth, and that is
`/design`'s to make.

Recorded from #233, closed as protocol-only work a shared tracker does not carry.
