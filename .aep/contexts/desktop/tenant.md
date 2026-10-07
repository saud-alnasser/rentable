---
paths:
  - apps/desktop/src/lib/tenant/**
use-when: "the request touches tenants, identity, or phone numbers"
---

# Tenant

The person who rents, and the identity rules that decide whether a record may exist.

## Language

**Tenant**:
A person who rents. Held as a name, a phone number, and a national identity number.

**National identity number**:
The government identifier a tenant is known by. One field accepting two document types —
a Saudi citizen's national ID, or a resident's iqama — distinguished by their leading
digit.
_Avoid_: iqama as the name of the field

**Iqama**:
The resident-permit form of the national identity number. Use this word only when the
resident case is specifically what is being discussed; the field itself is never called
this, because it accepts both forms.

## Boundaries

- **A tenant is not scoped to a complex.** The same person may hold contracts across
  several, and nothing about a tenant record is owned by a property.
- **Identity and phone are both unique across all tenants when a person saves**, and a tenant
  with contracts cannot be deleted. The tenant's acts refuse a value another tenant holds, in
  today's words; **the database no longer refuses one** (effort 857, requirement 14), since its
  rule made the sync engine drop the records of the second of two machines that saved one value
  apart. Two tenants made apart the same in every field heal into one after a pull
  ([[contexts/desktop/persistence]]); two that differ both stay, sharing the value.
- **An identity is normalized before it is validated, and stored normalized.** Surrounding
  whitespace is removed, then the whole value must be an identity number — one definition,
  which every caller that validates the field imports rather than restating. Records written
  before this held padding, so the normalization is also what repairs them, one save at a
  time; nothing corrects them in bulk.
