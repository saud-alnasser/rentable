---
status: implemented
sources:
  - src/lib/tenant/tenant.ts
  - src/lib/platform/database/schema.ts
  - src/lib/tenant/component/form.svelte
  - src/lib/tenant/router.test.mjs
---

# fix: the national identity number is validated by an unanchored pattern

## Problem

A tenant can be saved with a national identity number that is not one. The pattern the field
is validated against uses word-boundary assertions rather than anchors, so it matches a
correct number sitting anywhere inside a longer string that is not adjacent to a word
character. Padded, quoted and embedded values are all accepted:

| value | accepted today | correct |
| --- | --- | --- |
| `1234567890` | yes | yes |
| `!1234567890!` | **yes** | no |
| `  1234567890  ` | **yes** | no |
| `hello 1234567890 world` | **yes** | no |
| `abc1234567890xyz` | no | no |

The last row is rejected only by accident — `c`/`1` and `0`/`x` are not word boundaries — so
the behaviour is not even consistently wrong.

The phone number on the adjacent line is correctly anchored. The two fields of one concept
therefore disagree about how strict they are, and nothing in either says why.

Found in passing while designing #230, which fixes a seeding collision on the same field.
The two do not overlap: the seed generator treats a word boundary as zero-width, so it emits
the same ten characters before and after this change.

## Goal

A national identity number is accepted only when the entire value is one, in the same way a
phone number already is — and the values already stored under the loose pattern stop being a
trap without anyone having to find them.

## Constraints

- **The two accepted document forms are fixed by Saudi issuance**, not by this application.
  The value space does not move: a leading `1` or `2` followed by nine digits. This change is
  about what surrounds that, never about what it is.
- **The schema module is the single source of truth.** Table, validation and inferred type
  change together; the pattern has one definition and both validation sites import it.
- **Data already at rest cannot be reached.** Every user holds their own local SQLite file
  and there is no server, so there is no population to inspect, no way to know how many rows
  carry a padded value, and no opportunity to correct them centrally. Whatever this change
  does about them, it does from inside the application.
- **Uniqueness is enforced by the database.** The identity column is `UNIQUE`, so any
  normalization that runs over more than one row at a time can make two rows equal and fail.

## Architecture

The pattern lives in the tenant module, which owns the identity rules. Two callers import
it, and both are fixed by fixing it once: the schema, which the router derives its input
shape from, and the tenant form, which validates the same field in the webview before the
mutation is issued.

Normalization is added where validation already happens — as a transform on the schema's
string, ahead of the pattern test — so it applies to both callers by the same route the
pattern does, and no new seam appears. Nothing is added to the router, which validates and
does not normalize.

## Approach

Anchor the pattern, and trim the value before testing it.

Trimming is what makes anchoring safe to ship. Anchoring alone turns a stored padded value
into a record that cannot be saved: the form pre-fills the field from the row, so opening
that tenant and pressing save now fails against a message describing a shape the user
appears to have typed correctly. When the padding is whitespace it is invisible, and the
message names the wrong problem. With a trim in front, the same edit succeeds and writes the
clean value back, so the population self-heals one record at a time as it is touched, and
`!1234567890!` is still refused.

The cost, stated plainly: saving rewrites the stored value without telling the user. That is
accepted here because the rewrite only ever removes surrounding whitespace from a field whose
content is fixed-width and fixed-alphabet, so nothing a user meant can be lost.

**Rejected — anchor only.** Smallest change and never rewrites anything, but it strands
whatever is already stored behind an error message that cannot be acted on.

**Rejected — anchor, trim, and migrate the existing rows.** Correcting the stored values in
one pass sounds tidier and is the riskiest of the three. Migrations here are generated from
the schema and applied by Rust; a data migration that rewrites rows would be hand-authored
ahead of the schema, which is the shape this repository deliberately does not have. Worse,
trimming two rows that differ only by whitespace makes them equal, and the column is unique —
so the migration fails on the one machine it was supposed to help, during startup, with no
recovery path.

**Rejected — trim the phone number too.** The phone pattern is anchored and correctly
rejects a padded value today, so changing it is an enhancement riding on a bug fix. It is a
reasonable follow-up and it is not this.

## Acceptance criteria

- A tenant cannot be created or updated with a national identity number carrying leading,
  trailing or embedded characters — `!1234567890!` and `hello 1234567890 world` are both
  refused.
- A national identity number surrounded only by whitespace is accepted and stored without it.
- `1234567890` and `2234567890` are unchanged, in both the form and the router.
- A tenant already holding a whitespace-padded identity can be opened and saved without the
  user editing that field.
- Tests cover the refused forms and the normalized one.
- The seed script still produces values the pattern accepts.

## Risks

- **A user's stored value is padded with something other than whitespace.** Trimming does not
  reach it and the record becomes uneditable until the field is retyped. Judged unlikely —
  the form has always been the only way in and it offers no reason to type a punctuation mark
  — and detectable, because the failure is a `BAD_REQUEST` on that field with the message
  already written for it.
- **Two stored values differ only by whitespace.** Saving one after the other now collides on
  the unique column. This surfaces as the duplicate-identity error the form already handles,
  which is the correct outcome: they were always the same number.
- **The pattern is imported somewhere not found by this search.** Checked across `src/`;
  two importers. A third appearing later inherits the fix rather than fighting it, because
  the definition stays single.

## Out of scope

- **The phone number pattern.** Anchored and correct; see the rejected option above.
- **Any change to which document forms are accepted.** Saudi issuance fixes them.
- **Correcting stored values in bulk.** No migration, no startup pass, no repair command.
- **#230's seeding collision.** Same field, unrelated defect, its own ticket.
