---

---

# Question

When an offline client's changes conflict with the central database, and especially when two offline clients create records with the same value in a field that must be unique (a tenant's phone), how do offline-first synced apps that have a central database handle it, what happens to records that depend on the losing one (a contract on the refused tenant), and could rentable make the Turso primary the source of truth by validating each replica's pending changes against it before they are applied?

Asked by the human, 2026-10-07, at /implement of requirement 14: "why not treat online as the source of truth ... replicas are secondary and a changeset, as many replicas are especially offline." Researched 2026-10-07 against the effort tip in `_run` and the sources below. It builds on the measurement [[efforts/857-updating-never-locks-a-member-out/evidence/prototypes/what-a-duplicate-value-does-to-sync]] (cited below as **M**), which these findings do not repeat.

Five sub-questions:

1. how server-authoritative systems take a client's intents, reject them, report the rejection, and treat dependent changes;
2. how they treat uniqueness;
3. what Turso documents and its source does about conflicts and constraint failures in sync;
4. whether "pull first, validate the pending changes against the fresh primary, then push" is feasible for rentable, and what it costs;
5. how that compares with requirement 14 as written.

# Sources

All read 2026-10-07. Primary unless marked.

Server-authoritative sync systems:
- Replicache, How Replicache Works: https://doc.replicache.dev/concepts/how-it-works
- Replicache, Push Endpoint Reference: https://doc.replicache.dev/reference/server-push
- Rocicorp Zero, Mutators: https://zero.rocicorp.dev/docs/mutators
- Atlas Device SDK (Swift), Write Data to a Synced Realm: https://www.mongodb.com/docs/atlas/device-sdks/sdk/swift/sync/write-to-synced-realm.md
- Atlas App Services, Conflict Resolution: https://www.mongodb.com/docs/atlas/app-services/sync/details/conflict-resolution.md
- PowerSync, Handling Write / Validation Errors: https://docs.powersync.com/handling-writes/handling-write-validation-errors
- PowerSync, Handling Update Conflicts: https://docs.powersync.com/handling-writes/handling-update-conflicts
- PowerSync, Custom Conflict Resolution: https://docs.powersync.com/handling-writes/custom-conflict-resolution
- PowerSync, Writing Client Changes: https://docs.powersync.com/handling-writes/writing-client-changes
- PowerSync, Client-Side Integration With Your Backend: https://docs.powersync.com/configuration/app-backend/client-side-integration
- PowerSync, Consistency: https://docs.powersync.com/architecture/consistency
- PowerSync fatal Postgres error classes (Class 23, discard the transaction): **seen through a search summary only**, attributed to docs.powersync.com; the two pages above that were fetched did not contain the passage
- Electric, Writes guide (current Electric; electric-sql.com redirects here): https://electric.ax/docs/guides/writes
- ElectricSQL legacy, Constraints: https://legacy.electric-sql.com/docs/usage/data-modelling/constraints (the fetch failed on a TLS certificate mismatch; **seen through a search summary only**)
- Linear sync engine, reverse-engineering study by Wenzhu Zhu: https://github.com/wzhudev/reverse-linear-sync-engine (**secondary**; Linear has published no specification; search results quote Linear's CTO calling it the best documentation that exists, which was not verified at its origin)
- Linear, Scaling the Linear Sync Engine (talk summary page, no technical body): https://linear.app/now/scaling-the-linear-sync-engine
- Figma, How Figma's multiplayer technology works: https://www.figma.com/blog/how-figmas-multiplayer-technology-works/
- Firebase, Access data offline (Firestore): https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Firebase, Transactions and batched writes: https://firebase.google.com/docs/firestore/manage-data/transactions
- Firebase Realtime Database, Offline capabilities (Android): https://firebase.google.com/docs/database/android/offline-capabilities
- Firestore rejected offline writes being removed from the cache: **seen through a search summary only**, sourced to a Frontend Masters course (secondary)
- Couchbase Lite (Swift), Handling Data Conflicts: https://docs.couchbase.com/couchbase-lite/current/swift/conflict.html
- Couchbase Sync Gateway 3.2, Data Modeling: https://docs.couchbase.com/sync-gateway/3.2/data-modeling.html
- Couchbase forum, "How to implement unique constraints properly": https://www.couchbase.com/forums/t/how-to-implement-unique-constraints-properly-for-simple-or-compound-keys/25991 (**secondary**, seen through a search summary)
- Ditto, DQL INSERT: https://docs.ditto.live/dql/insert.md
- Ditto, Document Model: https://docs.ditto.live/key-concepts/document-model

Theory:
- Bailis, Fekete, Franklin, Ghodsi, Hellerstein, Stoica, "Coordination Avoidance in Database Systems", VLDB 2015 (extended version): https://arxiv.org/pdf/1402.2237 (downloaded, read with `pdftotext`, section 5 and Table 2)

Turso:
- Turso, Introducing Offline Writes for Turso: https://turso.tech/blog/introducing-offline-writes-for-turso
- Turso, Offline Sync Public Beta: https://turso.tech/blog/turso-offline-sync-public-beta
- Turso, Introducing Databases Anywhere with Turso Sync: https://turso.tech/blog/introducing-databases-anywhere-with-turso-sync
- Turso docs, Sync usage: https://docs.turso.tech/sync/usage
- tursodatabase/turso issue #6879, "Row-Dependent Expression Errors Can Commit Partial DML Effects Without Statement Rollback": https://github.com/tursodatabase/turso/issues/6879 (title and search summary only)
- Local source in the cargo registry, read: `turso_sync_engine-0.8.2/src/database_sync_operations.rs` (`send_push_batch`, lines about 2985 to 3213), `database_sync_engine.rs` (local replay after pull, about 2040 to 2130 and 2840 to 2930), `database_replay_generator.rs` (insert replay, about 520 to 600), `server_proto.rs` (`BatchCond`, about 220 to 247), `types.rs` (`DatabaseRowTransformResult`, `DatabaseRowMutation`, about 519 to 540); `turso_sync_sdk_kit-0.8.2/src/rsapi.rs` (about 240 to 270) and `src/sync_engine_io.rs` (about 315 to 321); `turso-0.8.2/src/sync.rs` (the public builder)

Rentable (observation): `.aep/efforts/857-updating-never-locks-a-member-out/spec.md` requirement 14; **M**.

# Findings

## 1. Server-authoritative models: intents, rejection, and dependent changes

**F1.1 source, Replicache.**
- The client sends mutations, not rows. The push endpoint invokes "the named mutator with the given arguments, canonicalizing the mutations' effects in the server's state" (How Replicache Works).
- On pull, the client "rewinds the state of the Client View to the last version it got from the server, applies the patch ... and then replays any pending mutations on top" (same page).
- A conflict is resolved by the mutator taking another code path on the server. In the documented `reserveRoom` example the server finds the room taken, leaves it untouched, and sets an error flag in the user's state, which the client pulls and displays (same page).
- A mutation that can never apply is skipped: "ignore that mutation and increment the `lastMutationID` as if it were applied". Otherwise "It is possible to deadlock a client" with a mutation that always errors (Push Endpoint Reference).

**F1.2 source, Zero (Rocicorp's successor to Replicache; Reflect, its earlier hosted product, was not checked).** If a server mutator throws, "the entire mutation is rolled back"; the error comes back to the client as a structured result on the `.server` promise; the mutation is skipped so later ones proceed, and its optimistic local effects are reverted (Mutators). Zero recommends client-generated random IDs (`crypto.randomUUID()`, ulid, nanoid) (same page).

**F1.3 source, Atlas Device Sync (Realm), deprecated by MongoDB.** A client write that breaks permissions or the subscription query first succeeds locally; "Upon sync, the server applies the rules ... The server sends a revert operation, called a 'compensating write', back to the client." The docs say what the person sees: "an object being written to the realm, and then disappearing". Dependants: "Any client-side writes to a given object between an illegal write to that object and the corresponding compensating write will be lost." The SDK reports `objectType`, `primaryKey` and `reason` through the sync error handler (Write Data to a Synced Realm). Atlas Device SDKs and App Services are marked deprecated / end-of-life on both pages.

**F1.4 source, PowerSync.**
- Writes go into a client upload queue, and your own backend applies them (Handling Update Conflicts).
- On a rejected write: "Change acknowledged but rejected (e.g. validation error). The client rolls back the change." The backend "should respond with 'success' (HTTP 2xx) even in the case of write conflicts or validation failures". To tell the person, include the error in the 2xx body, or "Write the details to a different table, asynchronously synced back to the client" (Handling Write / Validation Errors).
- An error response blocks the queue: the SDK "will retry the same upload indefinitely" (Client-Side Integration).
- The client "does not advance to a new checkpoint" while mutations are queued, and reverts to server state once a discarded write is acknowledged (Consistency).
- **Search summary only:** Postgres Class 23 errors (NOT NULL, FOREIGN KEY and UNIQUE) are listed as fatal. The advice is to discard the transaction, or save the failing records elsewhere and/or notify the user.

**F1.5 source, Electric (current).**
- Electric syncs reads; writes go through your API. Its guide names the hard part: "If an offline write is rejected by the server, the local application needs to find some way to revert the local state" (Writes guide).
- Its options run from "clear all local state if any write is rejected" to "only clearing the set of writes that are causally dependent on the rejected operation" (same page).

**F1.6 secondary, Linear.**
- Transactions are sent as GraphQL mutations. "If the server rejects the mutation query ... the transaction will trigger its `rollback` method to undo any changes made on the client side".
- Unsent transactions persist in a local `__transactions` table and are resent after a restart. Models are created with client-generated UUIDs (reverse-linear-sync-engine).
- Linear's own talk page has no technical body.

**F1.7 source, Figma.** "the server is the central authority"; concurrent property edits are last-writer-wins at the server. After offline work the client "downloads a fresh copy of the document, reapplies any offline edits on top". The server validates structure: "Figma's multiplayer servers reject parent property updates that would cause a cycle" (Figma blog).

**F1.8 source, Firestore.**
- Offline: "For multiple changes to the same document, it's last write wins" (Access data offline).
- Transactions are the read-check-write tool, and "Transactions will fail when the client is offline" (Transactions page).
- What happens to a queued write that security rules reject was **not found in a primary source**. A search summary of a secondary course says rejected writes are removed from the local cache.

**F1.9 source, Couchbase Lite.** A conflict is two changes to the same document. By default "The change with the latest timestamp wins" unless one is a deletion, and "A deleted document (that is, a tombstone) always wins". A custom resolver can choose local wins, remote wins or a merge (Handling Data Conflicts). Conflicts are resolved, not reported, unless a save uses `failOnConflict`.

**F1.10 source, Ditto.**
- `INSERT ... ON ID CONFLICT [FAIL | DO NOTHING | DO UPDATE | DO UPDATE_LOCAL_DIFF]` checks only "the local data store" (DQL INSERT).
- Documents with the same `_id` are one document, merged by CRDT. Relationships are a pattern, and the docs mention no referential integrity enforcement (Document Model).

**F1.11 interpretation.** Each system that rejects (Replicache, Zero, Realm, PowerSync, Linear, Figma) runs **its own code next to the central database** to decide. A rejection reaches the person in one of two ways:
- as a visible undo: the record "disappears" (Realm), the change is rolled back (Linear, Zero), or the client "will revert to the last known state" (PowerSync);
- as an error the app must show: Replicache's error flag, Zero's `.server` result, PowerSync's error table.

None makes a rejection invisible. On dependants:
- Realm says they are lost.
- Electric says the app must clear them.
- Replicache and Zero re-run each later mutation against the new state, so a dependant either applies or fails on its own terms.
- No system was found that keeps a dependant and re-points it at the winning record automatically.

## 2. How these systems treat uniqueness

**F2.1 source, theory.** Bailis et al. prove that uniqueness "is not I-confluent for inserts of unique values" (Claim 3): two valid replicas `{Stan:5}` and `{Mary:5}` merge into an invalid state. So no coordination-free scheme can enforce it. Two related results:
- "Can the database safely choose unique values on behalf of users (e.g., assign a new user an ID)? In this case, we can achieve uniqueness without coordination" (Claim 4).
- "Insertions under foreign key constraints are I-confluent" (Claim 6). This holds because a non-destructive merge "cannot cause tuples to 'disappear'" (section 5, Table 2).

**F2.2 source, by system.**
- **Realm.** Only the primary key: "If two sides both create objects of the same class with identical primary keys, they will be treated as instances of the same object", merged by "Last update wins" per property (Conflict Resolution).
- **Ditto.** Only `_id`, merged as one document. `ON ID CONFLICT` is local only (F1.10).
- **Couchbase.** Only the document key, "Unique within the bucket" (Sync Gateway Data Modeling). **Secondary:** the forum's answer is that unique constraints "are not a feature of Couchbase" and are emulated by a lookup document whose key is the unique value.
- **Figma.** Object IDs carry the client ID, so "no two clients will ever generate the same object ID".
- **Zero, Linear.** Client-generated UUIDs. Value uniqueness is whatever the server mutator checks (Replicache `reserveRoom`, F1.1).
- **PowerSync.** The backend database enforces it. **Search summary only:** a UNIQUE violation is treated as fatal, discarded or saved aside.
- **ElectricSQL legacy (search summary only).** "Unique constraints are not yet supported", being "subject to the same limitations of primary keys". In local-first, a duplicate "would only be detected after-the-fact, leaving the state of clients unreconcilable", so it refused to electrify tables with unsupported constraints and kept only primary and foreign keys.
- **Firestore.** It has no unique constraint. The read-check-write tool, a transaction, does not work offline (F1.8).

**F2.3 interpretation.** No system was found that enforces uniqueness of a person-typed value across offline clients and keeps both records. The patterns are:
1. **Server rejects:** PowerSync, Replicache or Zero mutators. One record is lost or bounced back to the person.
2. **The value is the identity:** Realm, Ditto, Couchbase lookup keys. The two records merge silently, field by field, last writer wins.
3. **Designed away:** client-generated IDs, with value uniqueness left to the app or not enforced (Figma, Zero, Linear, Electric legacy).

## 3. What Turso documents and its source shows

**F3.1 source, Turso's documentation.**
- Sync uses "last push wins" on conflicts (Sync usage; Databases Anywhere).
- The older offline-writes design said: "we allow the first push to go through, and expose an API that lets the application perform conflict resolution". It listed planned strategies: fail, discard local, rebase, manual (Introducing Offline Writes).
- The public beta listed "Conflict detection (but resolution is not yet implemented)" (Offline Sync Public Beta).
- The Databases Anywhere post describes a `transform` hook "applied to all mutations before they are sent to the remote" and says the WAL is kept to "rebase" local changes after a pull.
- No Turso page read says anything about constraint failures, push atomicity, or per-change errors.

**F3.2 observation, `turso_sync_engine` 0.8.2: the hook exists in the engine.** `DatabaseRowTransformResult` is `Keep | Skip | Rewrite(DatabaseStatementReplay)`, over a `DatabaseRowMutation` carrying `table_name`, `change_type`, `before`, `after` and `updates` (`types.rs`). When `opts.use_transform` is on, it is applied:
- per push batch in `send_push_batch`;
- to the local changes replayed after a pull (`database_sync_engine.rs`).

**F3.3 observation, the Rust SDK turns it off.** `turso_sync_sdk_kit-0.8.2/src/rsapi.rs` builds the engine with `use_transform: false`. Its IO's `transform` is `todo!()` under the comment `// todo(sivukhin): add mutation callbacks to the sdk-kit` (`sync_engine_io.rs`). `turso-0.8.2/src/sync.rs` exposes no transform option on its builder. **Rentable, through the `turso` crate, cannot use the hook** without patching the SDK kit.

**F3.4 observation, why a push half-applies, and what would make it atomic.**
- Every step after `BEGIN IMMEDIATE` carries `condition: Not(IsAutocommit)` (`send_push_batch`). So a failed statement leaves the transaction open, and the later steps, the cursor upsert and `COMMIT` still run. This is the mechanism behind **M**'s orphan.
- The Hrana protocol the engine speaks also has `BatchCond::Ok { step }` and `Error { step }` (`server_proto.rs`). Chaining each step on the previous one's `Ok`, with a `ROLLBACK` on `Error`, would make the push all-or-nothing. That is an engine change, not something the app controls.
- Per-change errors are already in the response (`step_errors`), but the engine turns the first one into a single error string.
- Issue #6879 (title and search summary only) reports another way Turso can commit partial statement effects.

**F3.5 observation, primary-key conflicts already merge.** Insert replay is `INSERT ... ON CONFLICT(<pk>) DO UPDATE SET <every column> = excluded.<column>` (`database_replay_generator.rs`). So two replicas inserting the same primary key become one row, last push wins, with no error. Only secondary `UNIQUE` indexes raise errors.

**F3.6 observation, the pull's replay is already "validate against fresh primary state".** After a pull, the engine replays unsent local changes inside one transaction on top of the remote state. A failure returns "failed to replay local change after remote apply" before `COMMIT` (`database_sync_engine.rs`), so the local database is unchanged (**M**, case `q1pull`). It checks the constraints that exist locally. It reports the first failing change only, as a string, with no row identity, and it offers no resolution except the disabled transform.

## 4. Feasibility for rentable: primary as truth, replicas as validated changesets

**F4.1 interpretation, what it would take.** Concretely: pull first; if the replay fails on a unique value, find the clashing pending rows; resolve them; push. Five gaps:
1. **Resolving needs the transform hook or surgery on `turso_cdc`.** The replay re-inserts each change's recorded after-image, so a later local edit does not stop the earlier insert from failing. Skipping or rewriting that change needs `Skip`/`Rewrite` (off in the Rust SDK, F3.3), or deleting rows from the engine's own `turso_cdc` table, which **M** already judged "engine internals that are not an API".
2. **Check-then-push is a race.** Nothing on Turso runs rentable's code, so the check happens on the client, before the push, not inside the primary's transaction. A second replica can push the same phone between this replica's pull and its push. That push then half-applies exactly as in **M** (F3.4). The systems that reject safely validate inside the server's own transaction (Replicache, Zero, PowerSync: F1.1, F1.2, F1.4).
3. **An atomic push alone would block.** If the engine were changed to make the push all-or-nothing (F3.4), the replica could never push until the clash was resolved. That is the "deadlock" Replicache warns about (F1.1), so gap 1 comes back.
4. **Offline it does nothing new.** An offline replica can check only against its own copy, which is what the save-time check in requirement 14 already does.
5. **The loser is visible.** Every precedent that rejects shows the person a record disappearing, a rollback, or an error (F1.11). Any of these "affects the user's understanding of the system data", which is what the human asked to avoid.

**F4.2 interpretation, costs.**
- Latency: one extra pull before every push. In practice pull-then-push is already the order of a sync, so this is small.
- Complexity: large. It needs a patched or forked SDK kit for the transform hook, or `turso_cdc` surgery. It needs a resolution policy and UI for the losing tenant and its contract, and an answer for the race in gap 2.
- A true source of truth that validates means running code next to the primary: a backend endpoint that applies intents (PowerSync, Replicache). That contradicts "We run nothing on Turso" and changes the product's architecture.

**F4.3 interpretation, the primary already is the source of truth.** Pull is physical, so every replica converges to the primary byte for byte (**M**, case `q4`; Databases Anywhere). Rows with the same primary key merge on the primary by last push (F3.5). The only thing that makes the primary *refuse* a replica's change is the four secondary `UNIQUE` indexes. Under Bailis's Claim 6, keeping every inserted row (no refusal) is what keeps foreign keys valid. **M**, case `q3`, saw exactly that: both tenants and the contract with its tenant.

## 5. Requirement 14, measured against the above

**F5.1 interpretation.** Each part of requirement 14 matches a pattern the sources use:
- **Drop the four `UNIQUE` indexes.** This puts rentable in pattern 3 of F2.3, which is the choice Figma, Zero, Linear, Ditto and Electric legacy made, and avoids the not-I-confluent constraint (F2.1). It removes the only source of refusal and of the orphan (F4.3, **M** `q3`, `q4`).
- **Check at save time.** This is the app-level check those systems leave to the app. Online it sees the fresh primary state; offline it sees the local copy (F4.1, gap 4).
- **Heal identical records into one, keeping the earlier.** No system found does this automatically for value-equal rows with different IDs. Realm, Ditto and Couchbase merge only when the *identity* is equal (F2.2). The heal is rentable's own design. It keeps dependants by moving them to the survivor, which no precedent found does (F1.11). Because the rows are identical in every field the person entered, nothing the person sees changes.
- **Leave differing records untouched.** This is the non-destructive merge Bailis's Claim 6 relies on: nothing disappears and no reference dangles.

**F5.2 interpretation, the alternative pattern 2 (the value is the identity).** Rentable could instead derive a tenant's primary key from its phone, so that the engine's own `ON CONFLICT(pk) DO UPDATE` (F3.5) merges two offline creates. That is the Realm, Ditto and Couchbase pattern. But it merges *differing* records by last push, silently overwriting fields the person typed. That is the "implicit change" the human excluded. It also makes a phone change a change of identity.

**F5.3 interpretation, a gap this research exposes in requirement 14 as written.** After two offline machines create differing tenants with the same phone, both remain. The save-time uniqueness check would then refuse an edit of either one, with today's "already used" message, even when the edit does not touch the phone. Whether the check should compare only a changed value, or exclude records that already share it, is not settled by these sources.

# Conclusion

**1. Server-authoritative systems.** Replicache, Zero, PowerSync, Realm, Linear and Figma accept a client's intent and let the server re-run or validate it inside its own transaction. A rejection comes back as a revert (Realm "compensating write", Linear and Zero rollback, PowerSync revert to checkpoint) or as an error the app must show (Replicache error flag, Zero `.server`, PowerSync error table) (F1.1 to F1.7). Dependent changes are lost (Realm), cleared by the app (Electric), or re-run on their own terms (Replicache, Zero). None re-points them at a winner (F1.11).

**2. Uniqueness of a typed value.** No offline-capable system found enforces it across clients while keeping both records. It is provably impossible without coordination (Bailis Claim 3). Systems either reject at a server with code (PowerSync, mutators), merge records whose identity is equal (Realm, Ditto, Couchbase), or design it away with generated IDs and leave value uniqueness to the app (F2.1 to F2.3).

**3. Turso.** It documents "last push wins" and a `transform` hook. The hook exists in `turso_sync_engine` 0.8.2 but is turned off, and left `todo!()`, in the Rust SDK that rentable uses (F3.2, F3.3). A push is not atomic: steps are conditioned only on "not autocommit". Per-change errors exist in the protocol response but surface as one string (F3.4). Primary-key clashes already merge silently (F3.5).

**4. Feasibility.** "Pull first, validate, then push" is partly what the engine's replay already does (F3.6). Rentable cannot resolve what it finds without the disabled hook or `turso_cdc` surgery. It cannot close the race between check and push without code on the primary. An atomic push would only turn the half-apply into a block. Every precedent that rejects makes the loss visible to the person (F4.1, F4.2). Making the primary truly validate would need a backend that applies intents, which rentable does not have.

**5. The researcher's reading of the evidence, for the human to decide.** Under rentable's constraints (no code on the primary, offline-first, rejections must not be seen), "online as the source of truth, replicas as changesets" does **not** fit better than requirement 14. The primary is already the source every replica converges to (F4.3). What made it refuse and half-apply was the four secondary `UNIQUE` indexes. Removing them is the coordination-free design the theory permits and the measured one that loses nothing (F2.1, **M** `q3`, `q4`). The strongest evidence:
- Bailis Claims 3 and 6: uniqueness of typed values cannot be kept without coordination, while inserts with foreign keys can under a merge that removes nothing.
- **M**: with the index dropped, no push or pull fails and the contract keeps its tenant.
- Realm, PowerSync, Zero and Linear: a server that validates makes the loser disappear or roll back, which the person sees.

One gap to settle in requirement 14 is F5.3: the save-time check must not lock edits of a pair of differing duplicates.

Confidence:
- **High** on Replicache, Zero, Realm, PowerSync's rejection and checkpoint pages, Electric's current guide, Figma, Couchbase Lite, Ditto, Bailis, and the Turso source (read directly).
- **Medium** on Linear (secondary study), the PowerSync Class 23 guidance, Electric legacy's unique-constraint page, and Firestore's handling of rejected writes (search summaries or secondary).
- The ranking and the fit judgement are interpretation.

# Not checked

- Reflect (Rocicorp's hosted Replicache): not looked up; Replicache and Zero stand in for it.
- ElectricSQL legacy's constraints page: the fetch failed on a certificate mismatch, and the archive could not be reached. Its wording comes from a search summary.
- PowerSync's page with the Class 23 (UNIQUE) "fatal, discard" guidance: the two candidate pages fetched did not contain it. The search summary attributes it to PowerSync's docs.
- Firestore: no primary statement found on what happens to a queued offline write that security rules reject, or on a recommended uniqueness pattern.
- Linear: no first-party technical source found. The study used is a reverse-engineering write-up.
- Couchbase's lookup-document pattern for uniqueness: a forum answer only, no product documentation found.
- Whether a newer `turso` crate than 0.8.2 exposes the transform hook or an atomic push: not checked.
- Whether the JavaScript `@tursodatabase/sync` package exposes `transform` today: the blog says so, but no package reference page was found.
- No test was run for this research. The F3.4 claim that `BatchCond::Ok` chaining would make the push atomic comes from reading the source, not from running it.
- Requirement 14's heal has no direct precedent in the sources read (F5.1). Its safety rests on rentable's own tests, not on a precedent.
