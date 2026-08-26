---
status: implemented
---

# refactor: coarse Drive command surface, credentials withdrawn, TypeScript client deleted

## Problem

The Google Drive client lives in the web layer. It sequences the protocol itself — resolve
a folder, read a manifest, compare heads, upload, rewrite the index — across a single
module of some twenty-three hundred lines, and it reaches Rust through nineteen
fine-grained commands that expose the steps rather than the outcomes. Two of those commands
still hand credentials across the process boundary: one returns the OAuth client secret,
and one returns account authorisation nothing calls at all.

The Rust replacement for the decision-making half already exists and has no caller. Nothing
reaches it, so every Drive request the application actually issues today is still the web
layer's.

Three families of operation exist only in the TypeScript, and each was missed the same way
— it is neither pure decision logic nor a file operation, so it fell between the two ports:
reading the account identity and storage quota, repairing a manifest and guarding a
manifest write, and applying a retention decision to a folder. Until they exist in Rust,
the module cannot be deleted without losing behaviour.

## Goal

Every Drive request is issued by Rust, behind a small surface of coarse operations that
callers observe rather than sequence. No credential crosses the process boundary. The
TypeScript client is gone.

## Constraints

- **Credentials never cross the IPC boundary.** This is the constraint the domain is being
  reshaped around and the reason the relocation was chosen (ADR 0003).
- **A retry may never create a second thing.** Any new write path answers this before it
  chooses a verb.
- **Google Drive offers no compare-and-set**, and the sync lock is in-process only, so
  concurrent writers are detected and repaired rather than prevented (ADR 0005).
- **Every branch stays green.** The old surface and the new one coexist until the last
  consumer moves, which is what allows that.
- **Backup is local, sync is remote, and both produce snapshots** — a change to snapshot
  shape touches both.

## Architecture

The provider area gains the three operation families it lacks, each landing beside the
ported logic it belongs with rather than in a new layer: the account read joins the
transfer surface, manifest repair and the write guard join the manifest concerns, and
retention's writes join retention. None of them is new design — each is a port of behaviour
the TypeScript already performs, with the manifest guard's semantics changed by ADR 0005
from refusing a write to rebuilding the index.

Above them sits the coarse surface: link, unlink, sync, observe state, resolve a conflict.
Each is one command that runs a whole flow to completion, where today the web layer issues
several and holds the intermediate state between them. The commands are added beside the
existing nineteen and both surfaces work until the contraction.

The web layer loses the client entirely. What remains on that side is a consumer of state:
it asks what the situation is, tells the user, and passes back the user's answer when a
conflict needs one.

## Approach

Expand and contract, migrated one flow at a time.

The three missing families go first as prefactoring, because every flow depends on at least
one and none of them can be discovered late. They are the only tickets here that deliver
nothing a user can see; each is verifiable by its own tests.

Then each user-visible flow moves whole — its coarse command and its consumer in the same
ticket, so no ticket leaves a command without a caller or a caller without a command. Link
moves first because it is the flow the missing account read unblocks, and because the
single-owner store it consumes is being built for it.

The contraction is last and is one ticket: the TypeScript module, the nineteen old
commands, and the two credential-bearing commands all go together, because none of them can
go before the final consumer moves and there is no value in staging the deletion.

**The edge between this work and the link-session-owner ticket is reversed.** That ticket
was blocked by this one; it now goes first and is unblocked. Giving the link flow a single
owner while the TypeScript is still there to read means the migration rewires one consumer
instead of two hand-rolled copies of the same five-step sequence, and the store's shape is
decided against working code rather than against a port in progress. It costs one rewrite
of that store, which is cheaper than writing the sequence twice.

**Rejected: a single cutover.** The original shape of this ticket. It does not fit one
commit — roughly seventeen hundred lines of ported orchestration, five commands, six
consuming files, and a twenty-three-hundred-line deletion — and nothing works until all of
it works.

**Rejected: keeping the TypeScript exports as thin adapters over the coarse commands**, so
the deletion could happen early and the consumers stay untouched. It reaches the deletion
sooner but not the goal: callers keep sequencing through the adapter, and an adapter layer
that exists only to be removed reliably outlives the ticket that promised to remove it.

**Rejected: a remote lease** to make concurrent writes safe — see ADR 0005.

## Acceptance criteria

- The Drive surface is approximately five coarse operations, each completing a flow.
- No command returns the client secret to the web layer.
- No command returns a refresh token to the web layer.
- No Drive network code remains in TypeScript.
- Linking, syncing, conflict resolution, and unlinking work end to end from the interface.
- A manifest that has been overwritten by another client is rebuilt from the snapshots
  present, and the user is not shown an error for it.
- An account can be identified at link time without the web layer supplying its details.
- A workspace folder's snapshots and superseded manifests are pruned by Rust.

## Risks

- **The rebuild path becomes load-bearing** and was previously an emergency path. Detected
  by testing it as a primary path — a rebuild from a folder listing must reproduce a
  manifest equal to one written normally, and that test is written before the rebuild is
  trusted.
- **A flow migration lands a command whose consumer still holds intermediate state**,
  leaving a half-sequenced flow that works by accident. Detected by each migration ticket
  removing its flow's imports of the old client entirely — a residual import is the signal.
- **The manifest save currently creates rather than updates**, which would produce a second
  manifest per sync the moment a coarse command calls it. Detected already, and fixed in
  the manifest ticket before any caller exists.
- **The stack is long and this work sits on top of it.** A rejected review low in the stack
  invalidates everything above. Mitigated only by the branches being small and independent.

## Out of scope

- Changing what a snapshot is, how retention is decided, or the local backup path.
- The remaining module-layout divergences under the restructure programme, including the
  parsing-beside-transport question raised separately.
- Making concurrent writes safe by prevention — ADR 0005 settles that this is not attempted.
- Any change to the OAuth flow itself, which already relocated.

## Ticket set (proposed — not yet created)

Root is the existing ticket being re-cut. Everything below hangs beneath it.

| # | Ticket | Blocked by | Delivers |
| --- | --- | --- | --- |
| root | the existing ticket, rescoped to the sum of its children | — | the goal above |
| 1 | port the account identity and quota read | — | linking can identify an account from Rust |
| 2 | port manifest repair and the manifest write guard, and stop the save creating a duplicate | — | a clobbered index is rebuilt, not lost |
| 3 | port retention's writes — prune snapshots, prune superseded manifests, empty a folder | — | a folder stops accumulating |
| 4 | link and unlink, end to end on the coarse surface | 1, and the link-session-owner ticket | linking works with no TypeScript Drive code |
| 5 | sync, end to end on the coarse surface | 2, 3 | syncing works with no TypeScript Drive code |
| 6 | conflict resolution, end to end on the coarse surface | 2 | resolving works with no TypeScript Drive code |
| 7 | delete the TypeScript client, the old commands, and the credential-bearing commands | 4, 5, 6 | the goal is met |

The link-session-owner ticket is edited to remove its blocker rather than being re-created,
and the ticket that waits on this whole programme keeps its edge to the root unchanged.
