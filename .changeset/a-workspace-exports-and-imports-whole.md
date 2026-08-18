---
'@rentable/desktop': minor
---

a whole workspace now moves as one file. settings writes every tenant, complex, unit, contract and payment to a single workbook — one sheet each — and reads one back. a record names what it points at by name rather than by row number, so a unit names its complex, a contract names its tenant and the units it holds, and a payment names its contract: the file opens on a machine that has never seen this database. the import shows what each sheet would do before anything is written, and a row naming a record no sheet holds refuses the whole file rather than importing the half that resolved. what does go in goes in as one write, so a refusal anywhere leaves the workspace exactly as it was
