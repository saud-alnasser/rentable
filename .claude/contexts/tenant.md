# Tenant

Sources: `src/lib/api/tenant.ts`, `src/lib/api/routers/tenant.ts`, `src/lib/resources/tenants/`

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
- **Identity and phone are both unique across all tenants**, and a tenant with contracts
  cannot be deleted.
