---
status: implemented
---

# fix(persistence): a value crosses the boundary typed by what it is

## Problem

Every query result crosses from Rust into the web layer through one conversion, and that
conversion asks the wrong question. It reads the column's **declared** SQL type and picks a
decoder from it. A selected expression — a count, a sum, an arithmetic result — has no
declared type, so it falls through to a default branch that guesses text. A numeric value
fails that decode, and the failure is turned into null.

So **a numeric expression selected through the proxy arrives in the web layer as `null`**,
with nothing raised anywhere. Found while building #251, whose directory row states how many
contracts a tenant holds: the count rendered blank against the real database while
typecheck, lint, 287 tests and the build were all green. Probed live, a text expression
arrived intact and an integer expression arrived as null, which locates the fault precisely
at the decoder choice rather than at the statement or its parameters.

Two properties make this worse than one wrong cell.

**It is silent.** Every branch of the conversion turns a decode failure into null. There is
no log line, no error, and no way for a caller to distinguish a column that was null from a
column the conversion could not handle. A gap in the mapping cannot announce itself.

**Nothing can test it.** The transport is shared down to the row reshaping and no further:
production converts values in Rust, while the test transport reads native values out of an
in-process engine and never runs that code. The harness is not weak here, it is structurally
blind — it executes under Node and cannot run Rust at all. A router test can assert an
aggregate and pass while the application renders nothing.

The defect is latent today: no shipped query selects a numeric expression. It blocks the
tickets that will — #251's active-contract count, #252's unit and vacant counts, and #268's
group-header money totals.

## Goal

A value crossing the boundary is converted by what it *is* rather than by what its column was
declared as, and a value the conversion cannot map fails loudly instead of arriving as null.

## Constraints

- **No shipped read may change.** The only declared types in the migrations are integer, text
  and real; all three already have their own branch and all three agree with the storage class
  their values actually carry. This is what bounds the risk of changing the dispatch, and it is
  a fact about the current schema rather than a guarantee — it is re-checked, not assumed, if
  the schema grows a type.
- **The row shape is fixed.** The web layer receives column names and positional values, and
  the query builder's proxy driver maps them by position. Nothing here may reorder or rename.
- **Blob encoding is part of that shape.** The in-memory transport reproduces the production
  base64 encoding deliberately so the two are identical; a change to one is a change to both.
- **Coverage has to be Rust-side.** The TypeScript harness cannot reach this code, so a test
  written there would be theatre.

## Architecture

The conversion is one function from an engine row to the transport shape, and the whole change
lives inside it.

The engine's driver exposes two different type questions, and the fault is that the function
asks the first when it needs the second: the **column**'s type is the type declared in the
schema, fixed for every row, and absent for anything that is not a plain column reference; the
**value**'s type is its storage class, read per value, and defined for every value there is.
Falling back to the declared type when a value is null is already the driver's own behaviour,
so nulls keep reporting their column's type and keep converting as they do now.

SQLite defines exactly five storage classes. Dispatching on the value therefore makes the match
**total** — there is no default branch, and each decode is asked for the type the value already
declared itself to be, so it cannot fail by construction. The error path that remains is
genuinely unreachable, which is what makes returning an error there right rather than harsh: if
it ever fires, the engine has produced something outside its own type system, and a null would
hide it.

That is the whole shape. The boundary's contract is unchanged — statement, parameters, and the
kind of result wanted, in; column names and positional values, out.

## Approach

One ticket. It is a single function and a test module, and splitting it would produce a change
that cannot be demonstrated.

The risky part is the claim that no shipped read changes, so that is what the tests establish
first: cover each storage class arriving through a real statement, including a value whose
storage class disagrees with its column's declared type, before the dispatch is switched. Tests
sit at the foot of the file they cover, which is this repository's Rust convention.

At least one test must **fail before the change and pass after it** — selecting an integer
expression and asserting a number arrives. Without that, nothing distinguishes this work from a
refactor.

Three alternatives were considered and rejected.

**Keep the null fallback**, fixing only the dispatch. The smallest possible change, and no query
that works today could begin failing. Rejected because the silence is the half of the defect that
matters: dispatching correctly fixes the case we found, and leaves the next gap exactly as
invisible as this one was.

**Try each decoder in order** and take the first that succeeds, with no type dispatch at all.
Rejected because argument order would silently decide every ambiguous value — the driver will
decode some text as a number — which trades a visible dispatch for a precedence rule written
nowhere and checked by nothing.

**Cast expressions to text in SQL** at each call site and parse them back in the web layer. This
was the workaround available inside #251 without touching Rust at all. Rejected because it needs
a paragraph of justification at every call site, which this repository takes as evidence the code
is wrong rather than as something to annotate, and because it leaves the boundary broken for the
next caller who does not know to cast.

## Acceptance criteria

- An integer expression selected through the proxy arrives in the web layer as a number.
- A real, a text, a blob and a null selected through the proxy each arrive as they do today,
  demonstrated by tests rather than by inspection.
- A value whose storage class differs from its column's declared type converts by its storage
  class.
- A value the conversion cannot map surfaces as a failed query, not as null.
- The Rust tests include one that fails against the current conversion.
- #251's active-contract count renders in the running application.

## Risks

- **A read changes that the schema evidence did not predict.** The constraint above rests on the
  declared types present in the migrations today. Detection: the storage-class tests cover each
  type the schema actually uses, and the full Rust and TypeScript suites both run — a changed
  read shows up as a router test failing on a value it used to receive.
- **An error path reached in practice.** The residual error is argued unreachable; if that
  argument is wrong, a query that used to return a null row now fails outright. Detection: it
  surfaces immediately and loudly, in the running app, which is the property being bought.
- **The blind spot stays.** This change covers the conversion but the harness split remains, so
  the next Rust-side defect is equally invisible. Not solvable here — recorded instead, so the
  next person planning a boundary change knows the coverage they do not have.

## Out of scope

- **Parameter binding.** The same silent-null shape exists on the way in: a JSON value that is
  neither string, number, boolean nor null is bound as null. No caller can currently produce
  one, so it is a separate concern and not folded into a change whose risk is being argued from
  the reads.
- **Closing the harness split.** Running the Rust conversion from the TypeScript suite would mean
  a second transport or a Tauri harness in Node. Out of proportion to this fix.
- **#251 itself.** It is unblocked by this and lands on its own ticket.
