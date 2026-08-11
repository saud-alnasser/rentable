---
owner: repository
status: accepted
load-when: a mutation writes more than one table, or atomicity of a multi-step write is in question
sources: [src/lib/platform/database/, tauri/src/database/]
supersedes: []
superseded-by: []
---

# A write that spans tables is one batch, and the batch is the transaction

Creating a complex and the units inside it is one act to the user and was two acts to the
application, because every write in this repository is issued as a separate query and a
half-applied pair had no way back. **A mutation that writes more than one table issues its
writes as a single batch**, which the boundary already runs inside one transaction and
commits at the end.

This is a capability being used rather than one being added: the batch command has always
opened a transaction, and the test transport has always matched it. What existed was a
Context statement asserting the opposite — recorded as drift in
`.claude/evidence/drift/the-batch-transport-is-a-transaction.md` — which is why the shape had
to be decided rather than simply adopted.

## Consequences

**A batch cannot branch on its own results, so validation happens before it.** Every query in
a batch is submitted together, so a check whose outcome decides a later write in the same
batch cannot live inside it. Refusals stay where they are — read first, then write once —
and the window between the two is accepted: this is a single-user desktop application with
one writer, and the constraint the database itself enforces is what catches the case anyway.

**Validating a set is not validating its members one at a time.** Two units submitted
together under the same name were previously impossible to express, because units could only
be added one dialog at a time. A flow that submits several has to refuse the collision
between them, not only the collision with what is already stored.

**Sequencing separate mutations is still not atomic, and is still the common case.** This
decision binds one mutation writing several tables. A user action that legitimately calls two
procedures — the ordinary case — gets no transaction and needs none, because each procedure
is individually complete.
