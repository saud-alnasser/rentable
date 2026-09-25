---
'@rentable/desktop': patch
---

undoing a contract's deletion puts it back as it was: a terminated contract comes back terminated, holding the units it held, even where another contract has taken one of them since. undoing a new contract is one step that cannot stop halfway, and an import that fails says so once
