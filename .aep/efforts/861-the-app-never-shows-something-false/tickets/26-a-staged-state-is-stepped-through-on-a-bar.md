---
status: open
blocked-by: [25]
---

# feat(desktop): a staged state is described once and stepped through on a bar

Authoritative: [[efforts/861-the-app-never-shows-something-false/spec]] (requirement 11), and [[efforts/861-the-app-never-shows-something-false/plan]] (*Staging*).

## Outcome

A state is a few lines naming its route, who is looking, what the records and the shell say, and what is done on screen to reach it; a bar steps through every state in the stage's files and switches language and appearance over any of them.

## Acceptance Criteria

Traces requirement 11 and criterion 11.

- [ ] A state that changes records, the member's permissions and a shell answer, and clicks through the interface, lands on its screen on entry; stepping away and back shows it again unchanged.
- [ ] The bar steps both ways, shows `n/N`, the state's label and what to look at, and switching language or appearance redraws the same state in the other one.
- [ ] Outside stage mode the bar and every state are absent.
- [ ] An example state file tours the main screens and is the default with no effort states present.

## Relevant areas

- apps/desktop/src/lib/prototype/switcher.svelte (the bar's idiom), apps/desktop/src/lib/prototype/stage/

## Constraints

- A state reaches its screen through records, host answers and on-screen steps only, never a flag read by product code.

## Notes
