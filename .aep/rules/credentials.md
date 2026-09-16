---
paths:
  - apps/desktop/tauri/src/sync/**
  - apps/desktop/tauri/src/organization/**
  - apps/desktop/src/lib/sync/**
  - apps/desktop/src/lib/organization/**
use-when: "a credential this application holds is being stored, refreshed, or handed to somebody"
---

<!--
  Merged 2026-08-17 from three single-decision rules, each of which was one
  converted ADR: drive-client-boundary, drive-concurrency,
  drive-transport-testing. **Two of the three are retired below rather than
  deleted** (#554, 2026-08-19): the code they bound is gone, and what each of
  them knew outlives it.
-->

# Credentials, and what Google Drive sync left behind

*This file was `rules/drive.md` until 2026-08-19. It is renamed rather than replaced because one
of its three sections is still a live rule and was never Drive's — a citation of
`[[rules/credentials]], under *Client boundary*` is the same rule under the name it should always have
had.*

> **Google Drive sync is retired.** Decision 07 of [[efforts/a-workspace-follows-its-user/spec]],
> directed by the human on 2026-08-18 and executed by #554: the transport, the file operations,
> the manifest, conflict analysis, retention, the link session, and every surface that offered
> them are deleted. A workspace is of record in Turso and reaches a machine as a replica.
>
> **One section of it is still a rule.** *Client
> boundary* was never Drive's alone — decision 09 widened it to every credential this application
> holds — and `sync/oauth/` still holds the protocol half, which the Turso consent drives.
> *`sync/google/` held Google's until Google sign-in retired with the control plane on 2026-09-12.*
> The other two sections describe code that no longer exists and are marked as retired where they
> stand.

## Client boundary

**Every network call that spends a credential, and every credential, stays in Rust.**

The Turso consent's PKCE verifier and code exchange, the Platform API token it produces, a
member's vault and the keys it unseals, and a workspace's sync token all live behind the Tauri
boundary. No credential crosses to TypeScript, and no command hands one over. *It named the
Google OAuth client secret, the refresh token, the profile read and the control plane's session
token until both retired on 2026-09-12.*

*Why: the credential boundary and the network boundary have to be the same boundary — where they
differ, the gap is exactly what an incident occupies.*

**Widened 2026-08-18** ([[efforts/a-workspace-follows-its-user/spec]], decision 09): this is the rule for **every**
credential this application holds, not Drive's alone. The workspace's sync token is a credential
and lives on the same side of the same boundary, for the same reason.

*The word "hosted" was dropped from that sentence on 2026-08-20 (#573). There is one kind of
workspace, so a qualifier that once picked one of two now reads as though some other kind of
workspace had a sync token this rule does not cover.*

**What crosses is facts *about* a credential, never one.** `OrganizationState` carries whether
this machine holds the Turso authority and `OrganizationSession` carries a member's role, permissions and
the workspaces their grants reach; the side that draws a screen needs those facts and needs nothing
else. *It named `RemoteSyncState`'s `tokenExpiresAt` and the session's three moments until the
session window retired with the control plane on 2026-09-12.*

**Two things cross that look like credentials and are sanctioned by the spec that made them.** The
join link crosses both ways as a string: it carries a read-only credential over sealed rows, which
is requirement 8's "nothing that is useful on its own", and it is handed to a person to send. The
generated password crosses once, out of `member_invite` and `member_reset`, because the person who
must hand it on is on the other side of the boundary; it is never stored on this side. Neither is
a key, a token that reaches a ledger, or the Turso authority, and a third thing that looks like
these two is a finding rather than a third exception.

*Corrected 2026-09-15 ([[efforts/826-the-organization-and-the-way-in-are-rethought/spec]],
requirements 8 and 23): the generated password no longer crosses at all. It leaves `invite::issue`
in two sealed columns of the invitation row and nowhere else. What crosses in its place is the
six-character confirmation code, out of `member_invite`, `member_reset` and `invitation_code`,
because the person who reads it out on a call is on the other side of the boundary; it lapses
ninety seconds after it is made, it is one half of what opens the invited vault and the link's
secret is the other, and it is never stored on this side. The invitation link crosses as before,
carrying the invitation id and the link secret. Those are still the two, and the sentence above
about a third holds.*

**What a link is worth to whoever finds it.** *Added 2026-09-15
([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]], requirements 1, 2, 4 and
5).* There are two kinds. **The organization's own link** carries the read-only credential over the
organization database in the clear, and that credential is minted with no expiry, so it is the one
credential this application holds that never lapses: whoever finds it pulls a replica of every
sealed row and guesses passwords offline for as long as they like, and the password floor is the
only bound. It is the owner's recovery copy and is handed to nobody, and it connects a machine with
no code precisely because when every machine is gone there is nobody left to read one out.
**Every other link** — an invitation, a reset, and the second-machine link effort 828 adds —
carries no legible credential at all: the issuer's own four-week grant on the organization database
and, where the link opens a vault, the password that vault was made under, sealed together under a
key Argon2id derives from a six-character code salted with the link's own thirty-two byte secret,
with the link's kind, its row and the moment it lapses bound as associated data. What stands
between a found link and the directory is therefore thirty-two to the sixth guesses at Argon2id,
the bound the invited vault already accepted, and the credential inside is dead within four weeks
whatever happens to the link. Reading a link is a decode and reaches nothing; the code is checked
by being used, never compared, and it lives exactly as long as the link it came with. *The
invitation code crossed out of `invitation_code` until 2026-09-15; there is one code per link now,
so it crosses out of `member_invite`, `member_reset` and `invitation_link`, and a fresh code means
a fresh link. Corrected 2026-09-16 (requirements 19 and 20): those three commands are gone, and a
code crosses out of `member_link_make` alone, which is the one act that makes a link. Nothing hands
a link over a second time, so nothing reads a code back out of a row.*

*Corrected 2026-09-16 ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
requirement 16, which supersedes requirement 4): **no link carries a legible credential, and the
"every other link" paragraph above now describes every link there is.** The organization's own link
retired, and with it the never-expiring read-only credential it was the only holder of: nothing
mints one, nothing stores one, nothing shows one and nothing accepts one, the column that held it
sealed is gone from the organization row, and there is no kind of link left that connects a machine
without a code. What each link carries is what that paragraph says, on all of them.*

*Corrected 2026-09-16 ([[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]],
requirement 20): **there are two kinds of link, and a reset is not one of them.** The paragraph
above glosses "every other link" as an invitation, a reset and the second-machine link effort 828
adds, which is three; what the code holds is two, `HalfKind::Invitation` and `HalfKind::Machine`. A
reset makes no link at all: `invite::unset_password`, held to `resetPassword`, takes an account's
password away and reseals its grants, and what follows it is an ordinary link made from the
account's card, asking the person to choose a new password because the account now has none. The
second-machine link is not a third kind either; it is the machine kind, made by the owner or an
administrator for an account no machine is signed in on. What each of the two carries is what that
paragraph says, unchanged.*

*And **the owner's way back is the account**, which is why the recovery copy could go. An owner
whose every machine is gone repeats the Turso consent and signs in with their own username and
password, and that password is what re-derives the organization's key either way (requirement 14).
Nothing about who can recover an organization changed; what changed is that recovering it no longer
needs a credential kept somewhere a finder could read.*

Recorded originally as ADR 0003, *The Google Drive client relocates wholly to Rust*.

## Concurrency — **retired 2026-08-19 with the transport it bound (#554)**

It read: *concurrent Drive writes are detected and repaired, never prevented.* Snapshots were the
source of truth, the manifest a derived index, and a mismatch on the read-then-compare before a
manifest write rebuilt the manifest from the snapshots actually present rather than refusing the
write.

**Two things it knew are still true and are why it is kept here rather than deleted.** Drive v3
offers no compare-and-set — no ETag, no precondition, no reserved status code — so anywhere a lock
is reached for against it, the lock inherits the race it was meant to remove. And **what replaced
this concern rather than answering it**: a replica resolves divergence per column as it arrives,
so there is no pair of whole snapshots for anybody to choose between, and nothing to repair.

Recorded originally as ADR 0005, *Drive concurrency is detected and repaired, not prevented*.

## Transport testing — **retired 2026-08-19 with the transport it bound (#554)**

It read: *the Drive transport is tested against a real local HTTP server.* Run one in-process and
point the client at it; never substitute a mocked transport trait, and never contact the live API
from a test.

**The reasoning outlived the transport and is being applied**: a mocked trait tests the mock's
idea of HTTP, so the serialisation and status handling that actually break are never exercised.
The loopback server survives as `sync/test/server.rs` and is what every request to Turso, the
consent, the Platform API, the MCP lookup, a workspace's pipeline and the sync engine's own, is
tested against. *It was `sync/google/test/server.rs` and tested the Google profile read and every
control-plane call until both retired on 2026-09-12.*

**The *never contact the live API from a test* clause has declared exceptions since
2026-08-20**, and they are [[rules/testing]]'s to state and to count, under *Tests that reach a live
remote*. The first was the replica divergence tests, which reach a real Turso database because what
they measure is the remote's own merge behaviour and a loopback server for it would mean
implementing the thing under test. There are three as of 2026-08-22, each admitted for a property
the others do not have. Read
that section before writing anything else that reaches a live service. The clause above is
otherwise unchanged and still binds every transport.

Recorded originally as ADR 0004, *Drive transport is tested against a local HTTP server*.
