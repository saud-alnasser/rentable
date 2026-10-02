---
status: resolved
---

# docs(aep): a context says which component shows what

Authoritative: [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], and [[efforts/846-the-settings-and-the-record-cards-are-rethought/plan]] for the approach.

## Outcome

Added mid-run at the human's word of 2026-10-02: "what it seems to me is that you struggle on what ui primitive components or type to use in what place; so i want you to categorize the usage of each of the package/desgin components and when based on a reasrch on these types of components then create a context in aep here to point to what to use on ui desgin and make it an instruciton for you when you choose a compnent ot show data or actions in the app".

Every primitive in `packages/design/src/lib/primitive/` and every block in `packages/design/src/lib/block/` (and the app's own cells in `apps/desktop/src/lib/design/cell/`) is categorised by what it is for (showing data, showing status, taking an action, choosing a value, entering text, disclosing detail, interrupting, guiding, navigating, laying out), with when to use it, when not to, and the nearest alternative, grounded in cited research on what each kind of component is for in established design systems. The result is a context the agent reads before choosing a component, and the interface rule makes reading it binding.

## Acceptance Criteria

Traces the human's request of 2026-10-02 (requirement 1 as widened that day, and requirement 22).

- [x] `evidence/research/what-each-kind-of-component-is-for.md` cites primary sources (at least Apple's HIG, Material 3, Microsoft Fluent 2, shadcn/ui and Radix docs, and two of IBM Carbon, Shopify Polaris, Atlassian, GOV.UK) for each kind of component the package holds. *Verified: read `evidence/research/what-each-kind-of-component-is-for.md`: Apple HIG (28 pages), Material 3, Fluent 2, shadcn/ui and shadcn-svelte, Radix and bits-ui, Carbon, GOV.UK and Atlassian, each kind of component with a finding; Polaris recorded as not checked (its component pages redirect).*
- [x] `.aep/contexts/desktop/components.md` exists with `paths` over the design package, the cells and every `.svelte` file in the app, and a `use-when` naming the choice of a component to show data or take an action; it names every primitive and block in the package (a check script or test lists the folders and finds each named), each with its category, when to use, when not to, and the alternative. *Verified: `.aep/contexts/desktop/components.md` carries the briefed `paths` and `use-when`; `node --test src/tests/components-context.test.ts src/tests/governance.test.ts` printed pass 6, fail 0, the first listing the primitive and block folders and finding every one named (34 primitives, 22 blocks, 11 cells).*
- [x] It carries a decision table from need to component (a value to set, a status to read, a list of records, detail few need, an act that ends something, a short choice of two to five, and so on), and each row names the component this repository already uses for it, with one file where it is used. *Verified: read the decision table: 27 rows from need to component, each naming the component in use and one file.*
- [x] [[rules/interface]] says a component is chosen by that context, and the context points back to the rule for look and placement; `node .aep/scripts/validate.mjs` passes and the index is regenerated. *Verified: `grep` finds the binding paragraph at rules/interface line 37, the context points back to the rule for look and placement; `validate.mjs` printed 562 artifacts checked, no failures, after `index.mjs`.*

## Relevant areas

- `.aep/contexts/desktop/`, `.aep/rules/interface.md`, `packages/design/src/lib/{primitive,block}/`, `apps/desktop/src/lib/design/cell/`

## Constraints

- Say what the repository does, not what it might do; a component the package does not hold is named only as a gap.
- No source change.
