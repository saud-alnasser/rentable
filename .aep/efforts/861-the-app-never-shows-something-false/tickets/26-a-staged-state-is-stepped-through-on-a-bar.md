---
status: resolved
blocked-by: [25]
---

# feat(desktop): a staged state is described once and stepped through on a bar

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 11), and [[efforts/861-the-app-never-shows-something-false/plan]] (*Staging*).

## Outcome

A state is a few lines naming its route, who is looking, what the records and the shell say, and what is done on screen to reach it; a bar steps through every state in the stage's files and switches language and appearance over any of them.

## Acceptance Criteria

Traces requirement 11 and criterion 11.

- [x] A state that changes records, the member's permissions and a shell answer, and clicks through the interface, lands on its screen on entry; stepping away and back shows it again unchanged. Verified: a probe state inserting a tenant, signing in a member who may view tenants and complexes, answering the workspace name from the host and clicking into the tenant landed with all four in place, and after stepping to `example.contracts` and back its screenshot was byte-identical; 861's 12 states reached their screens in all 48 combinations.
- [x] The bar steps both ways, shows `n/N`, the state's label and what to look at, and switching language or appearance redraws the same state in the other one. Verified: the bar reads `n/N · label`, steps with its arrows (wrapping), shows the look line, and EN/AR and light/dark reload the same state in the other choice, as the 48 screenshots show.
- [x] Outside stage mode the bar and every state are absent. Verified: the plugin applies only to `serve` in `stage` mode; the web build holds none of `previous state`, `move the bar`, `example.landing`.
- [x] An example state file tours the main screens and is the default with no effort states present. Verified: `state/example.ts` holds the landing, tenants, complexes and contracts, sorts last, and is what the bar opened on (`1/4 · landing`) with 861's file moved out.

## Relevant areas

- apps/desktop/src/lib/prototype/switcher.svelte (the bar's idiom), apps/desktop/src/lib/prototype/stage/

## Constraints

- A state reaches its screen through records, host answers and on-screen steps only, never a flag read by product code.

## Notes
